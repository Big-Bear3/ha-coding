import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IP_ADDRESS_PORT } from '../config/config.js';

type RequestMethod = 'GET' | 'get' | 'POST' | 'post' | 'PUT' | 'put' | 'DELETE' | 'delete' | 'PATCH' | 'patch';

export class HttpService {
    static #instance: HttpService;

    readonly axios: AxiosInstance;

    private constructor() {
        this.axios = axios.create({ baseURL: `http://${IP_ADDRESS_PORT}`, timeout: 10000 });
        this.addInterceptors();
    }

    private addInterceptors(): void {
        this.axios.interceptors.request.use(
            (request) => {
                return Promise.resolve(request);
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        this.axios.interceptors.response.use(
            (response) => {
                return Promise.resolve((response as any).data);
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    get<R = any, P = any>(url: string, params?: P, config?: AxiosRequestConfig): Promise<R> {
        return new Promise((resolve, reject) => {
            this.axios
                .get(url, {
                    ...config,
                    params
                })
                .then((res: R | any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    post<R = any, P = any>(url: string, params: P, config?: AxiosRequestConfig): Promise<R> {
        return new Promise((resolve, reject) => {
            this.axios
                .post(url, params, config)
                .then((res: R | any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    put<R = any, P = any>(url: string, params: P, config?: AxiosRequestConfig): Promise<R> {
        return new Promise((resolve, reject) => {
            this.axios
                .put(url, params, config)
                .then((res: R | any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    delete<R = any, P = any>(url: string, params?: P, config?: AxiosRequestConfig): Promise<R> {
        return new Promise((resolve, reject) => {
            this.axios
                .delete(url, {
                    ...config,
                    params
                })
                .then((res: R | any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    patch<R = any, P = any>(url: string, params: P): Promise<R> {
        return new Promise((resolve, reject) => {
            this.axios
                .patch(url, params)
                .then((res: R | any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    request<R = any, P = any>(url: string, method: RequestMethod, params?: P): Promise<R> {
        if (method === 'GET' || method === 'get') {
            return this.get(url, params);
        }
        if (method === 'POST' || method === 'post') {
            return this.post(url, params);
        }
        if (method === 'PUT' || method === 'put') {
            return this.put(url, params);
        }
        if (method === 'DELETE' || method === 'delete') {
            return this.delete(url, params);
        }
        if (method === 'PATCH' || method === 'patch') {
            return this.patch(url, params);
        }

        return undefined;
    }

    static get instance(): HttpService {
        if (!HttpService.#instance) HttpService.#instance = new HttpService();
        return HttpService.#instance;
    }
}
