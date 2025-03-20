import type { Class, ObjectKey } from '../types/types';
import type { CallInfoGetter } from '../services/call-service';
import { isStaticMember } from '../utils/object-utils.js';
import { StateManager } from '../managers/state-manager.js';

export interface StateOptions {
    persistentKeyGetter?: ($entityIds: Record<string, string>) => string;
    persistentKey?: string;
}

export function State(): PropertyDecorator;
export function State(callInfoGetter: CallInfoGetter): PropertyDecorator;
export function State(stateOptions: StateOptions): PropertyDecorator;
export function State(callInfoGetter: CallInfoGetter, stateOptions: StateOptions): PropertyDecorator;
export function State(
    callInfoGetterOrStateOptions?: CallInfoGetter | StateOptions,
    stateOptions?: StateOptions
): PropertyDecorator {
    return function (c: Class, key: ObjectKey) {
        if (isStaticMember(c)) return;
        if (typeof callInfoGetterOrStateOptions === 'function') {
            StateManager.instance.handleState(c, key, callInfoGetterOrStateOptions, stateOptions);
        } else {
            StateManager.instance.handleState(c, key, undefined, callInfoGetterOrStateOptions);
        }
    } as PropertyDecorator;
}
