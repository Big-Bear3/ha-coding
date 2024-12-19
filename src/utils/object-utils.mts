import type { Class } from '../types/types';

/** 判断是否是静态成员变量 */
export function isStaticMember(c: Class): boolean {
    return !!c.prototype;
}
