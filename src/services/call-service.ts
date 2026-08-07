import { nextTick } from 'process';
import { MiRouter } from './mi/mi-router.js';
import { IMMEDIATE_CALL } from '../config/config.js';
import { logger } from './logger-service.js';

export interface CallInfo {
    entityId: string;
    service: string;
    serviceData?: Record<string, any>;
    unmergeable?: boolean;
}

export type CallInfoGetter = (value: any) => CallInfo | Promise<CallInfo>;

export class CallService {
    static #instance: CallService;

    #callingQueue: CallInfo[] = [];

    #callingIsActivated = false;

    #callable = true;

    set callable(value: boolean) {
        this.#callable = value;
    }

    get callable() {
        return this.#callable;
    }

    private constructor() {}

    push(callInfo: CallInfo): void {
        this.#callingQueue.push(callInfo);

        if (!this.#callingIsActivated) {
            this.#callingIsActivated = true;

            if (IMMEDIATE_CALL) {
                this.call();
            } else {
                nextTick(() => {
                    this.call();
                });
            }
        }
    }

    call(): void {
        try {
            const router = MiRouter.instance;
            const callInfoMap = new Map<string, CallInfo>();
            let unmergeableIndex = 0;

            while (this.#callingQueue.length > 0) {
                const callInfo = this.#callingQueue.shift();
                // unmergeable 用唯一 key 不参与合并，与可合并项一同按插入顺序输出
                const key = callInfo.unmergeable
                    ? `__unmergeable_${unmergeableIndex++}`
                    : callInfo.entityId + '##' + callInfo.service;
                const existing = callInfoMap.get(key);
                if (existing) {
                    existing.serviceData = {
                        ...(existing.serviceData ?? {}),
                        ...(callInfo.serviceData ?? {})
                    };
                } else {
                    callInfoMap.set(key, { ...callInfo });
                }
            }

            const emit = (callInfo: CallInfo): void => {
                const domain = callInfo.entityId.split('.')[0];
                const extra =
                    callInfo.serviceData && Object.keys(callInfo.serviceData).length
                        ? ' ' + JSON.stringify(callInfo.serviceData)
                        : '';
                logger.info(`[call] ${domain}.${callInfo.service} ${callInfo.entityId}${extra}`);
                router.call(callInfo);
            };

            for (const callInfo of callInfoMap.values()) emit(callInfo);

            this.#callingIsActivated = false;
        } catch (error) {
            logger.printError(error);
        }
    }

    static get instance(): CallService {
        if (!CallService.#instance) CallService.#instance = new CallService();
        return CallService.#instance;
    }
}
