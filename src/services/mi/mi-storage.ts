import { localStorage } from '../../utils/local-storage.js';
import { MI_SPEC_CACHE_TTL, MI_SPEC_CACHE_VERSION } from './mi-constants.js';
import type { MiAuthInfo } from './mi-types.js';

const AUTH_INFO_KEY = 'mi_auth_info';
const USER_KEY_KEY = 'mi_user_key';
const USER_CERT_KEY = 'mi_user_cert';
const VIRTUAL_DID_KEY = 'mi_virtual_did';
const DEVICE_ID_KEY = 'mi_device_id';
const UID_KEY = 'mi_uid';
const SPEC_CACHE_PREFIX = 'mi_spec_v2_';
/** 旧格式前缀（版本号前的遗留，clearSpecCache 一并清除） */
const SPEC_CACHE_PREFIX_LEGACY = 'mi_spec_';

/** 小米直连凭证持久化存储（复用 ha-coding 的 localStorage） */
export class MiStorage {
    static #instance: MiStorage;

    private constructor() {}

    getAuthInfo(): MiAuthInfo {
        const raw = localStorage.getItem(AUTH_INFO_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    setAuthInfo(info: MiAuthInfo): void {
        localStorage.setItem(AUTH_INFO_KEY, JSON.stringify(info));
    }

    getUserKey(): string {
        return localStorage.getItem(USER_KEY_KEY);
    }

    setUserKey(key: string): void {
        localStorage.setItem(USER_KEY_KEY, key);
    }

    getUserCert(): string {
        return localStorage.getItem(USER_CERT_KEY);
    }

    setUserCert(cert: string): void {
        localStorage.setItem(USER_CERT_KEY, cert);
    }

    getVirtualDid(): string {
        return localStorage.getItem(VIRTUAL_DID_KEY);
    }

    setVirtualDid(did: string): void {
        localStorage.setItem(VIRTUAL_DID_KEY, did);
    }

    getDeviceId(): string {
        return localStorage.getItem(DEVICE_ID_KEY);
    }

    setDeviceId(deviceId: string): void {
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    getUid(): string {
        return localStorage.getItem(UID_KEY);
    }

    setUid(uid: string): void {
        localStorage.setItem(UID_KEY, uid);
    }

    /**
     * 读取 spec 缓存。版本不匹配或已过期返回 null（视为未缓存，触发重新拉取）。
     * 信封格式 { v, ts, data }，v 为 MI_SPEC_CACHE_VERSION。
     * 无信封的旧格式（裸 spec JSON）也返回 null，实现平滑升级。
     */
    getSpec(urn: string): string {
        const raw = localStorage.getItem(SPEC_CACHE_PREFIX + urn);
        if (!raw) return null;
        try {
            const envelope = JSON.parse(raw);
            if (envelope?.v !== MI_SPEC_CACHE_VERSION) return null;
            if (typeof envelope.ts !== 'number') return null;
            if (Math.floor(Date.now() / 1000) - envelope.ts >= MI_SPEC_CACHE_TTL) return null;
            return JSON.stringify(envelope.data);
        } catch {
            return null;
        }
    }

    setSpec(urn: string, spec: string): void {
        try {
            const envelope = {
                v: MI_SPEC_CACHE_VERSION,
                ts: Math.floor(Date.now() / 1000),
                data: JSON.parse(spec)
            };
            localStorage.setItem(SPEC_CACHE_PREFIX + urn, JSON.stringify(envelope));
        } catch {
            /* 存储满或 spec 非法 JSON 时忽略 */
        }
    }

    /**
     * 清空 spec 缓存，返回清除条数。
     * 版本号已能自动失效，这里供排障用（例如怀疑上游 spec 变更但版本号未动）。
     */
    clearSpecCache(): number {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(SPEC_CACHE_PREFIX) || key?.startsWith(SPEC_CACHE_PREFIX_LEGACY)) keys.push(key);
        }
        for (const key of keys) localStorage.removeItem(key);
        return keys.length;
    }

    /** 清除全部凭证（用于重新登录） */
    clear(): void {
        localStorage.removeItem(AUTH_INFO_KEY);
        localStorage.removeItem(USER_KEY_KEY);
        localStorage.removeItem(USER_CERT_KEY);
        localStorage.removeItem(VIRTUAL_DID_KEY);
        localStorage.removeItem(DEVICE_ID_KEY);
        localStorage.removeItem(UID_KEY);
    }

    static get instance(): MiStorage {
        if (!MiStorage.#instance) MiStorage.#instance = new MiStorage();
        return MiStorage.#instance;
    }
}

