import type { TenantContext } from '@celebix/saas-contracts';
import { catalogAuthority, CATALOG_UUID } from '../catalog/validation.ts';
import { MerchantContentRepositoryError, MERCHANT_CONTENT_ERROR_CODES, type MerchantContentErrorCode } from './errors.ts';
export function invalid(): never { throw new MerchantContentRepositoryError('invalid_input'); }
export function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const d = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]);
    const out: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(d)) {
        if (typeof key !== 'string' || !allowed.has(key) || !d[key]!.enumerable || !('value' in d[key]!))
            invalid();
        out[key] = d[key]!.value;
    }
    if (required.some(k => !Object.hasOwn(out, k)))
        invalid();
    return out;
}
// Current authority is server-supplied, but validation never executes foreign accessors.
function data(value: unknown, depth = 0): unknown {
    if (depth > 20)
        invalid();
    if (value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value)) {
        const d = Object.getOwnPropertyDescriptors(value);
        for (const k of Reflect.ownKeys(d)) {
            if (k === 'length')
                continue;
            if (typeof k !== 'string' || !/^\d+$/.test(k) || !d[k]!.enumerable || !('value' in d[k]!))
                invalid();
        }
        return value.map(v => data(v, depth + 1));
    }
    const d = Object.getOwnPropertyDescriptors(value);
    if (Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const out: Record<string, unknown> = {};
    for (const k of Reflect.ownKeys(d)) {
        if (typeof k !== 'string' || !d[k]!.enumerable || !('value' in d[k]!))
            invalid();
        out[k] = data(d[k]!.value, depth + 1);
    }
    return out;
}
export function authority(context: unknown, now: unknown, write: boolean) {
    if (!(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype || !Number.isFinite(Date.prototype.getTime.call(now)))
        invalid();
    try {
        const parsed = catalogAuthority(data(context) as TenantContext, new Date(Date.prototype.getTime.call(now)));
        if (!(write ? ['store_owner', 'admin', 'editor'] : ['store_owner', 'admin', 'editor', 'analyst']).includes(parsed.role))
            throw new MerchantContentRepositoryError('membership_denied');
        return parsed;
    }
    catch (error) {
        if (error instanceof MerchantContentRepositoryError)
            throw error;
        const code = (error as {
            code?: unknown;
        })?.code;
        throw new MerchantContentRepositoryError(typeof code === 'string' && (MERCHANT_CONTENT_ERROR_CODES as readonly string[]).includes(code) ? code as MerchantContentErrorCode : 'invalid_input');
    }
}
export function uuid(value: unknown) { if (typeof value !== 'string' || !CATALOG_UUID.test(value))
    invalid(); return value; }
export function version(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalid(); return value as number; }
export function kind(value: unknown) { if (value !== 'page' && value !== 'blog_post')
    invalid(); return value; }
export function fingerprint(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    invalid(); return value; }
