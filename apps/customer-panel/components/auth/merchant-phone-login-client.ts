import { normalizeStorefrontAccountPhone } from '../../../storefront-shared/lib/account/phone.ts';
export type MerchantPhoneLoginState = Readonly<{
    phase: 'phone' | 'code';
    maskedPhone?: string;
    resendAt?: string;
    expiresAt?: string;
}>;
export type MerchantPhoneLoginClient = Readonly<{
    state(): Promise<MerchantPhoneLoginState>;
    start(input: {
        phone: string;
        operationId: string;
    }): Promise<MerchantPhoneLoginState>;
    resend(input: {
        operationId: string;
    }): Promise<MerchantPhoneLoginState>;
    verify(input: {
        code: string;
        operationId: string;
    }): Promise<MerchantPhoneLoginState | Readonly<{
        phase: 'complete';
    }>>;
}>;
export type MerchantPhoneBindingState = MerchantPhoneLoginState & Readonly<{
    phoneMasked: string | null;
    phoneVerified: boolean;
}>;
export type MerchantPhoneBindingClient = MerchantPhoneLoginClient & Readonly<{
    selfState(): Promise<MerchantPhoneBindingState>;
}>;
export const MERCHANT_COMPLETE_PATH = '/auth/merchant-phone/complete';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function merchantLoginMessage(code: string): string { const messages: Record<string, string> = { invalid_phone: 'Geçerli bir kişisel telefon numarası girin.', invalid_code: 'Kod doğrulanamadı. Kontrol ederek yeniden deneyin.', challenge_expired: 'Kodun süresi doldu. Yeni kod isteyin.', locked: 'Kod doğrulanamadı. Yeni kod isteyin.', rate_limited: 'Yeni kod istemeden önce lütfen bekleyin.', resend_wait: 'Yeni kod istemeden önce lütfen bekleyin.', delivery_uncertain: 'Kodun gönderildiği doğrulanamadı. Bekleyip durumu kontrol edebilirsiniz.', operation_uncertain: 'İşlem sonucu doğrulanamadı. Bilgileriniz korunuyor; durumu kontrol edebilirsiniz.', csrf_invalid: 'Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyin.' }; return messages[code] ?? 'Giriş tamamlanamadı. Bilgileriniz korunuyor; yeniden deneyebilirsiniz.'; }
export class MerchantPhoneLoginError extends Error {
    constructor(readonly code: string, readonly retryAfterSeconds?: number) { super(merchantLoginMessage(code)); }
}
export function normalizeMerchantPhone(value: string): string {
    try {
        return normalizeStorefrontAccountPhone(value);
    }
    catch {
        throw new MerchantPhoneLoginError('invalid_phone');
    }
}
function state(value: unknown): MerchantPhoneLoginState {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new MerchantPhoneLoginError('unavailable');
    const row = value as Record<string, unknown>;
    if (!['phone', 'code'].includes(String(row.phase)) || Object.keys(row).some(key => !['phase', 'maskedPhone', 'resendAt', 'expiresAt'].includes(key)) || (row.maskedPhone !== undefined && (typeof row.maskedPhone !== 'string' || row.maskedPhone.length > 80)))
        throw new MerchantPhoneLoginError('unavailable');
    for (const key of ['resendAt', 'expiresAt'])
        if (row[key] !== undefined && (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key])) || new Date(row[key]).toISOString() !== row[key]))
            throw new MerchantPhoneLoginError('unavailable');
    return Object.freeze(row as MerchantPhoneLoginState);
}
function createPhoneClient(mode: 'login' | 'bind', options: Readonly<{
    fetch?: typeof fetch;
}> = {}): MerchantPhoneBindingClient {
    const transport = options.fetch ?? fetch;
    let csrfToken: string | undefined;
    async function request(action: 'state' | 'start' | 'resend' | 'verify', body?: {
        phone?: string;
        code?: string;
        operationId: string;
    }): Promise<MerchantPhoneLoginState | Readonly<{
        phase: 'complete';
    }>> {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (body) {
            if (!UUID.test(body.operationId))
                throw new MerchantPhoneLoginError('unavailable');
            const csrf = csrfToken;
            if (!csrf)
                throw new MerchantPhoneLoginError('csrf_invalid');
            headers['content-type'] = 'application/json';
            headers['idempotency-key'] = body.operationId;
            headers['x-celebix-merchant-phone-csrf'] = csrf;
        }
        let response: Response;
        try {
            response = await transport(`/api/merchant-login/${mode === 'bind' ? 'bind/' : ''}${action}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        }
        catch {
            throw new MerchantPhoneLoginError('operation_uncertain');
        }
        const result = await response.json().catch(() => null);
        if (response.ok && action === 'verify' && result?.code === (mode === 'bind' ? 'phone_bound' : 'complete') && Object.keys(result).join(',') === 'code')
            return Object.freeze({ phase: 'complete' as const });
        if (!response.ok || result?.code !== 'ok') {
            throw new MerchantPhoneLoginError(typeof result?.code === 'string' ? result.code : 'unavailable', Number.isSafeInteger(result?.retryAfterSeconds) && result.retryAfterSeconds > 0 && result.retryAfterSeconds <= 3600 ? result.retryAfterSeconds : undefined);
        }
        if (action === 'state') {
            if (Object.keys(result).sort().join(',') !== 'code,csrfToken,state' || typeof result.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.csrfToken))
                throw new MerchantPhoneLoginError('unavailable');
            csrfToken = result.csrfToken;
        }
        else if (Object.keys(result).sort().join(',') !== 'code,state')
            throw new MerchantPhoneLoginError('unavailable');
        if (mode === 'bind') {
            const self = result.state;
            if (!self || typeof self !== 'object' || Array.isArray(self) || typeof self.phoneVerified !== 'boolean' || (self.phoneMasked !== null && (typeof self.phoneMasked !== 'string' || self.phoneMasked.length > 80)) || (self.phoneVerified && !self.phoneMasked))
                throw new MerchantPhoneLoginError('unavailable');
            const { phoneMasked, phoneVerified, ...challenge } = self;
            return Object.freeze({ ...state(challenge), ...(phoneMasked?{maskedPhone:phoneMasked}:{}), phoneMasked, phoneVerified }) as MerchantPhoneBindingState;
        }
        return state(result.state);
    }
    return Object.freeze({ selfState: () => request('state') as Promise<MerchantPhoneBindingState>, state: () => request('state') as Promise<MerchantPhoneLoginState>, start: input => request('start', { phone: normalizeMerchantPhone(input.phone), operationId: input.operationId }) as Promise<MerchantPhoneLoginState>, resend: input => request('resend', { operationId: input.operationId }) as Promise<MerchantPhoneLoginState>, verify: input => {
            if (!/^[0-9]{6}$/.test(input.code))
                return Promise.reject(new MerchantPhoneLoginError('invalid_code'));
            return request('verify', { code: input.code, operationId: input.operationId });
        } });
}
export function createMerchantPhoneLoginClient(options: Readonly<{
    fetch?: typeof fetch;
}> = {}): MerchantPhoneLoginClient { return createPhoneClient('login', options); }
export function createMerchantPhoneBindingClient(options: Readonly<{
    fetch?: typeof fetch;
}> = {}): MerchantPhoneBindingClient { return createPhoneClient('bind', options); }
