import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import axios from 'axios';
import * as x509 from '@peculiar/x509';
import { logger } from '../logger-service.js';
import { MiStorage } from './mi-storage.js';
import {
    MI_OAUTH2_CLIENT_ID,
    MI_OAUTH2_AUTH_URL,
    MI_OAUTH2_API_HOST,
    MI_HTTP_API_TIMEOUT,
    MI_TOKEN_EXPIRES_RATIO,
    MI_TOKEN_REFRESH_THRESHOLD,
    MI_CERT_EXPIRE_MARGIN,
    MI_CERT_REFRESH_THRESHOLD,
    MIHOME_CA_CERT_STR
} from './mi-constants.js';
import type { MiAuthInfo } from './mi-types.js';

/** 把 DER Buffer 转成 PEM 字符串 */
function derToPem(der: Buffer, type: string): string {
    const b64 = der.toString('base64');
    const lines = b64.match(/.{1,64}/g).join('\n');
    return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`;
}

/** 小米中枢网关认证管理：OAuth 登录、Ed25519 密钥、CSR、云端签证书、自动刷新 */
export class MiCertManager {
    static #instance: MiCertManager;

    #storage = MiStorage.instance;

    #tokenRefreshTimer: NodeJS.Timeout;

    #certRefreshTimer: NodeJS.Timeout;

    #cloudServer = 'cn';

    private constructor() {
        // @peculiar/x509 使用 WebCrypto，绑定 Node 内置实现
        try {
            x509.cryptoProvider.set(globalThis.crypto as any);
        } catch (error) {
            logger.printError(error);
        }
    }

    /** 是否已完成登录认证（具备 token + 私钥 + 证书） */
    isAuthenticated(): boolean {
        return (
            !!this.#storage.getAuthInfo() &&
            !!this.#storage.getUserKey() &&
            !!this.#storage.getUserCert() &&
            !!this.#storage.getVirtualDid()
        );
    }

    /** 生成 OAuth 授权 URL */
    genAuthUrl(redirectUri: string, deviceId: string): string {
        const state = crypto.createHash('sha1').update(`d=${deviceId}`).digest('hex');
        const params = new URLSearchParams({
            redirect_uri: redirectUri,
            client_id: MI_OAUTH2_CLIENT_ID,
            response_type: 'code',
            device_id: deviceId,
            state,
            skip_confirm: 'false'
        });
        return `${MI_OAUTH2_AUTH_URL}?${params.toString()}`;
    }

    /**
     * 首次登录：打印授权 URL，用户浏览器登录授权后，
     * 从浏览器地址栏复制跳转后的完整 URL 粘贴回控制台，提取 code 换取 token。
     *
     * 注意：小米 OAuth 仅接受注册的 redirect_uri（homeassistant.local:8123/api/webhook/*），
     * 因此无法用 localhost 回调，改用手动复制授权码方式。
     */
    async login(redirectUrl: string): Promise<void> {
        let authInfo = this.#storage.getAuthInfo();

        if (!authInfo) {
            // 首次：OAuth 授权获取 code -> 换 token
            const deviceId = this.getOrCreateDeviceId();
            const virtualDid = this.getOrCreateVirtualDid();
            const redirectUri = `${redirectUrl}/api/webhook/${virtualDid}`;
            const authUrl = this.genAuthUrl(redirectUri, deviceId);
            logger.print(`[MiCert] 请在浏览器打开以下地址登录小米账号并授权：\n${authUrl}`);
            logger.print(
                '[MiCert] 授权后浏览器会跳转到一个可能无法打开的页面（正常现象）。\n' +
                    '请复制浏览器地址栏的完整 URL 粘贴到下方：'
            );

            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const redirectedUrl = await rl.question('粘贴跳转后的完整 URL: ');
            rl.close();

            let code: string;
            try {
                code = new URL(redirectedUrl.trim()).searchParams.get('code');
            } catch {
                code = redirectedUrl.trim();
            }
            if (!code) throw new Error('未从 URL 解析到授权码 code');

            authInfo = await this.getAccessToken(code, redirectUri, deviceId);
            authInfo.redirect_uri = redirectUri;
            authInfo.device_id = deviceId;
            this.#storage.setAuthInfo(authInfo);
        } else {
            logger.print('[MiCert] 已有 token，跳过 OAuth，直接签发证书');
        }

        let uid = this.#storage.getUid();
        if (!uid) {
            uid = await this.fetchUid(authInfo.access_token);
            if (!uid) throw new Error('无法获取 uid');
            this.#storage.setUid(uid);
        }
        authInfo.uid = uid;
        this.#storage.setAuthInfo(authInfo);

        await this.ensureUserCert(uid);
        logger.print('[MiCert] 登录认证成功');
        this.scheduleRefresh();
    }

    /** 启动时检查凭证，已认证则调度刷新，未认证需调用 login */
    ensureReady(): void {
        if (!this.isAuthenticated()) {
            logger.printWarn('[MiCert] 未认证，请调用 login 完成 OAuth 登录');
            return;
        }
        this.scheduleRefresh();
    }

    /** 用授权码换取 access_token */
    private async getAccessToken(code: string, redirectUri: string, deviceId: string): Promise<MiAuthInfo> {
        // client_id 超过 JS Number 安全整数范围，手动拼接 JSON 避免精度丢失
        const data = `{"client_id":${MI_OAUTH2_CLIENT_ID},"redirect_uri":${JSON.stringify(redirectUri)},"code":${JSON.stringify(code)},"device_id":${JSON.stringify(deviceId)}}`;
        const res = await axios.get(`https://${MI_OAUTH2_API_HOST}/app/v2/ha/oauth/get_token`, {
            params: { data },
            timeout: MI_HTTP_API_TIMEOUT * 1000
        });
        const result = res.data?.result;
        if (!result?.access_token) throw new Error(`换取 token 失败：${JSON.stringify(res.data)}`);
        return {
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_ts: Math.floor(Date.now() / 1000 + result.expires_in * MI_TOKEN_EXPIRES_RATIO)
        };
    }

    /** 刷新 access_token */
    async refreshAccessToken(): Promise<MiAuthInfo> {
        const authInfo = this.#storage.getAuthInfo();
        if (!authInfo?.refresh_token) throw new Error('无 refresh_token，需重新登录');

        const data = `{"client_id":${MI_OAUTH2_CLIENT_ID},"redirect_uri":${JSON.stringify(authInfo.redirect_uri ?? '')},"refresh_token":${JSON.stringify(authInfo.refresh_token)}}`;
        const res = await axios.get(`https://${MI_OAUTH2_API_HOST}/app/v2/ha/oauth/get_token`, {
            params: { data },
            timeout: MI_HTTP_API_TIMEOUT * 1000
        });
        const result = res.data?.result;
        if (!result?.access_token) throw new Error(`刷新 token 失败：${JSON.stringify(res.data)}`);

        const newInfo: MiAuthInfo = {
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_ts: Math.floor(Date.now() / 1000 + result.expires_in * MI_TOKEN_EXPIRES_RATIO),
            uid: authInfo.uid,
            redirect_uri: authInfo.redirect_uri,
            device_id: authInfo.device_id
        };
        this.#storage.setAuthInfo(newInfo);
        logger.print('[MiCert] access_token 已刷新');
        return newInfo;
    }

    /** 获取有效的 access_token，过期则先刷新 */
    async getValidAccessToken(): Promise<string> {
        const authInfo = this.#storage.getAuthInfo();
        if (!authInfo) throw new Error('未认证');
        if (authInfo.expires_ts - Math.floor(Date.now() / 1000) <= MI_TOKEN_REFRESH_THRESHOLD) {
            const refreshed = await this.refreshAccessToken();
            return refreshed.access_token;
        }
        return authInfo.access_token;
    }

    /** 通过 home info 接口获取 uid */
    private async fetchUid(accessToken: string): Promise<string> {
        try {
            const res = await axios.post(
                `https://${MI_OAUTH2_API_HOST}/app/v2/homeroom/gethome`,
                { limit: 150, fetch_share: true, fetch_share_dev: true, plat_form: 0, app_ver: 9 },
                {
                    headers: this.apiHeaders(accessToken),
                    timeout: MI_HTTP_API_TIMEOUT * 1000
                }
            );
            const homeList = res.data?.result?.homelist;
            if (Array.isArray(homeList) && homeList.length > 0 && homeList[0].uid != null) {
                return String(homeList[0].uid);
            }
            return null;
        } catch (error) {
            logger.printError('[MiCert] 获取 uid 失败');
            logger.printError(error);
            return null;
        }
    }

    /** mihome API 请求头（注意 Bearer 与 token 间无空格） */
    private apiHeaders(accessToken: string): Record<string, string> {
        return {
            'X-Client-BizId': 'haapi',
            'Content-Type': 'application/json',
            Authorization: `Bearer${accessToken}`,
            'X-Client-AppId': MI_OAUTH2_CLIENT_ID
        };
    }

    private apiHost(): string {
        return this.#cloudServer === 'cn' ? MI_OAUTH2_API_HOST : `${this.#cloudServer}.${MI_OAUTH2_API_HOST}`;
    }

    /** 生成或读取 device_id（ha.{uuid}） */
    getOrCreateDeviceId(): string {
        let deviceId = this.#storage.getDeviceId();
        if (!deviceId) {
            deviceId = `ha.${crypto.randomUUID()}`;
            this.#storage.setDeviceId(deviceId);
        }
        return deviceId;
    }

    /** 生成或读取 virtual_did（mTLS clientId 与 CSR did_hash 用） */
    getOrCreateVirtualDid(): string {
        let did = this.#storage.getVirtualDid();
        if (!did) {
            // crypto 生成 15-16 位数字（范围 < 2^53，randomInt 安全）
            did = String(crypto.randomInt(1e14, 9e15));
            this.#storage.setVirtualDid(did);
        }
        return did;
    }

    /** 确保已具备私钥与终端证书，缺失则生成并签发 */
    private async ensureUserCert(uid: string): Promise<void> {
        let userKey = this.#storage.getUserKey();
        if (!userKey) {
            userKey = await this.genUserKey();
            this.#storage.setUserKey(userKey);
        }
        if (!this.#storage.getUserCert()) {
            const did = this.getOrCreateVirtualDid();
            const csr = await this.genUserCsr(userKey, uid, did);
            const cert = await this.getCentralCert(csr);
            this.#storage.setUserCert(cert);
        }
    }

    /** 生成 Ed25519 私钥（PEM PKCS8） */
    private async genUserKey(): Promise<string> {
        // Node WebCrypto 对 Ed25519 用 name 'Ed25519'（非标准 'EdDSA'）
        const alg = { name: 'Ed25519' } as any;
        const keyPair = await globalThis.crypto.subtle.generateKey(alg, true, ['sign']);
        const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        return derToPem(Buffer.from(pkcs8), 'PRIVATE KEY');
    }

    /** 生成 CSR，subject: C=CN, O=Mijia Device, CN=mips.{uid}.{sha1(did).hex}.2 */
    private async genUserCsr(userKeyPem: string, uid: string, did: string): Promise<string> {
        const didHash = crypto.createHash('sha1').update(did, 'utf8').digest('hex');
        const cn = `mips.${uid}.${didHash}.2`;

        // 从 PEM 导入私钥（WebCrypto）
        const keyDer = Buffer.from(userKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64');
        const privateKey = await globalThis.crypto.subtle.importKey('pkcs8', keyDer, { name: 'Ed25519' } as any, false, ['sign']);

        // 用 node:crypto 从私钥派生公钥，再导入 WebCrypto 供 CSR 签名
        const privKeyObj = crypto.createPrivateKey(userKeyPem);
        const pubKeyObj = crypto.createPublicKey(privKeyObj);
        const pubSpki = pubKeyObj.export({ type: 'spki', format: 'der' });
        const publicKey = await globalThis.crypto.subtle.importKey('spki', pubSpki as Buffer, { name: 'Ed25519' } as any, true, [
            'verify'
        ]);

        const keys = { privateKey, publicKey };
        const alg = { name: 'Ed25519' } as any;
        const csr = await (x509 as any).Pkcs10CertificateRequestGenerator.create({
            name: `CN=${cn}, O=Mijia Device, C=CN`,
            keys,
            signingAlgorithm: alg
        });
        return csr.toString('pem');
    }

    /** 调用云端接口签发终端证书 */
    private async getCentralCert(csrPem: string): Promise<string> {
        const accessToken = await this.getValidAccessToken();
        const res = await axios.post(
            `https://${this.apiHost()}/app/v2/ha/oauth/get_central_crt`,
            { csr: Buffer.from(csrPem, 'utf8').toString('base64') },
            {
                headers: this.apiHeaders(accessToken),
                timeout: MI_HTTP_API_TIMEOUT * 1000
            }
        );
        const cert = res.data?.result?.cert;
        if (typeof cert !== 'string') throw new Error(`签发证书失败：${JSON.stringify(res.data)}`);
        return cert;
    }

    /** 证书剩余有效时间（秒） */
    certRemainingTime(): number {
        const certPem = this.#storage.getUserCert();
        if (!certPem) return 0;
        try {
            const cert = new crypto.X509Certificate(certPem);
            return Math.floor((new Date(cert.validTo as any).getTime() - Date.now()) / 1000);
        } catch (error) {
            logger.printError(error);
            return 0;
        }
    }

    /** 刷新终端证书（复用私钥） */
    async refreshUserCert(): Promise<void> {
        const uid = this.#storage.getUid();
        const userKey = this.#storage.getUserKey();
        if (!uid || !userKey) {
            logger.printWarn('[MiCert] 缺少 uid 或私钥，无法刷新证书');
            return;
        }
        const did = this.getOrCreateVirtualDid();
        const csr = await this.genUserCsr(userKey, uid, did);
        const cert = await this.getCentralCert(csr);
        this.#storage.setUserCert(cert);
        logger.print('[MiCert] 终端证书已刷新');
    }

    /** 调度 token 与证书的自动刷新 */
    scheduleRefresh(): void {
        this.scheduleTokenRefresh();
        this.scheduleCertRefresh();
    }

    private scheduleTokenRefresh(): void {
        clearTimeout(this.#tokenRefreshTimer);
        const authInfo = this.#storage.getAuthInfo();
        if (!authInfo) return;
        const refreshIn = Math.max(
            (authInfo.expires_ts - Math.floor(Date.now() / 1000) - MI_TOKEN_REFRESH_THRESHOLD) * 1000,
            60 * 1000
        );
        this.#tokenRefreshTimer = setTimeout(async () => {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                logger.printError('[MiCert] token 刷新失败');
                logger.printError(error);
            }
            this.scheduleTokenRefresh();
        }, refreshIn);
    }

    private scheduleCertRefresh(): void {
        clearTimeout(this.#certRefreshTimer);
        const refreshIn = Math.max(
            (this.certRemainingTime() - MI_CERT_EXPIRE_MARGIN - MI_CERT_REFRESH_THRESHOLD) * 1000,
            60 * 1000
        );
        this.#certRefreshTimer = setTimeout(async () => {
            try {
                await this.refreshUserCert();
            } catch (error) {
                logger.printError('[MiCert] 证书刷新失败');
                logger.printError(error);
            }
            this.scheduleCertRefresh();
        }, refreshIn);
    }

    /** CA 证书（两张） */
    getCaCert(): string {
        return MIHOME_CA_CERT_STR;
    }

    getUserCert(): string {
        return this.#storage.getUserCert();
    }

    getUserKey(): string {
        return this.#storage.getUserKey();
    }

    getVirtualDid(): string {
        // 只读，不写存储（写由 getOrCreateVirtualDid 在 login 时完成）
        return this.#storage.getVirtualDid();
    }

    /** 云服务区（cn/us/de/...），用于云端 MQTT broker 选址 */
    get cloudServer(): string {
        return this.#cloudServer;
    }

    static get instance(): MiCertManager {
        if (!MiCertManager.#instance) MiCertManager.#instance = new MiCertManager();
        return MiCertManager.#instance;
    }
}

