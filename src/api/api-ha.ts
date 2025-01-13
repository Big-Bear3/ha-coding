import { HA_PASSWORD, HA_USER_NAME, IP_ADDRESS_PORT } from '../config/config.js';
import { HttpService } from '../services/http-service.js';

const httpService = HttpService.instance;

export function getLoginInfo() {
    const params = {
        client_id: `http://${IP_ADDRESS_PORT}`,
        handler: ['homeassistant', null],
        redirect_uri: `http://${IP_ADDRESS_PORT}/?auth_callback=1`
    };

    return httpService.post('/auth/login_flow', params, {
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
}

export function login(flowId: string) {
    const params = {
        client_id: `http://${IP_ADDRESS_PORT}`,
        username: HA_USER_NAME,
        password: HA_PASSWORD
    };

    return httpService.post('/auth/login_flow/' + flowId, params, {
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
}

export function getToken(code: string) {
    const formData = new FormData();
    formData.append('client_id', `http://${IP_ADDRESS_PORT}`);
    formData.append('code', code);
    formData.append('grant_type', 'authorization_code');

    return httpService.post('/auth/token', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
}
