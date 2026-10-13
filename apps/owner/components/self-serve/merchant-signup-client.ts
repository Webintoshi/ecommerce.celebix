import { normalizeStorefrontAccountPhone } from '../../../storefront-shared/lib/account/phone.ts';
export type MerchantSignupState = Readonly<{
    phase: 'phone' | 'code';
    maskedPhone?: string;
    resendAt?: string;
    expiresAt?: string;
}>;
export type MerchantSignupClient = Readonly<{
    state(): Promise<MerchantSignupState>;
    start(input: {
        phone: string;
        operationId: string;
    }): Promise<MerchantSignupState>;
    resend(input: {
        operationId: string;
    }): Promise<MerchantSignupState>;
    verify(input: {
        code: string;
        operationId: string;
    }): Promise<Readonly<{
        phase: 'verified';
    }>>;
}>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function signupMessage(code: string) { const messages: Record<string, string> = { invalid_phone: 'Geçerli bir kişisel telefon numarası girin.', invalid_code: 'Kod doğrulanamadı. Kontrol ederek yeniden deneyin.', challenge_expired: 'Kodun süresi doldu. Yeni kod isteyin.', locked: 'Kod doğrulanamadı. Yeni kod isteyin.', resend_wait: 'Yeni kod istemeden önce lütfen bekleyin.', rate_limited: 'Yeni kod istemeden önce lütfen bekleyin.', delivery_uncertain: 'Kodun gönderildiği doğrulanamadı. Bekleyip durumu kontrol edin.', operation_uncertain: 'İşlem sonucu doğrulanamadı. Bilgileriniz korunuyor; durumu kontrol edebilirsiniz.', csrf_invalid: 'Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyin.' }; return messages[code] ?? 'Telefon doğrulaması tamamlanamadı. Bilgileriniz korunuyor; yeniden deneyebilirsiniz.'; }
export class MerchantSignupError extends Error {
    constructor(readonly code: string, readonly retryAfterSeconds?: number) { super(signupMessage(code)); }
}
export function signupPhone(value: string) { try {
    return normalizeStorefrontAccountPhone(value);
}
catch {
    throw new MerchantSignupError('invalid_phone');
} }
function parseState(value: unknown): MerchantSignupState { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MerchantSignupError('unavailable'); const s = value as Record<string, unknown>; if (!['phone', 'code'].includes(String(s.phase)) || Object.keys(s).some(k => !['phase', 'maskedPhone', 'resendAt', 'expiresAt'].includes(k)) || (s.maskedPhone !== undefined && (typeof s.maskedPhone !== 'string' || s.maskedPhone.length > 80)))
    throw new MerchantSignupError('unavailable'); for (const key of ['resendAt', 'expiresAt'])
    if (s[key] !== undefined && (typeof s[key] !== 'string' || !Number.isFinite(Date.parse(s[key])) || new Date(s[key]).toISOString() !== s[key]))
        throw new MerchantSignupError('unavailable'); return Object.freeze(s as MerchantSignupState); }
export function createMerchantSignupClient(options: Readonly<{
    fetch?: typeof fetch;
}> = {}): MerchantSignupClient {
    const transport = options.fetch ?? fetch;
    let csrfToken: string | undefined;
    async function request(action: 'state' | 'start' | 'resend' | 'verify', body?: {
        operationId: string;
        phone?: string;
        code?: string;
    }) {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (body) {
            if (!UUID.test(body.operationId))
                throw new MerchantSignupError('unavailable');
            if (!csrfToken)
                throw new MerchantSignupError('csrf_invalid');
            headers['content-type'] = 'application/json';
            headers['idempotency-key'] = body.operationId;
            headers['x-celebix-merchant-phone-csrf'] = csrfToken;
        }
        let response: Response;
        try {
            response = await transport(`/api/merchant-signup/${action}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        }
        catch {
            throw new MerchantSignupError('operation_uncertain');
        }
        const result = await response.json().catch(() => null);
        if (response.ok && action === 'verify' && result?.code === 'phone_verified' && Object.keys(result).join(',') === 'code')
            return Object.freeze({ phase: 'verified' as const });
        if (!response.ok || result?.code !== 'ok')
            throw new MerchantSignupError(typeof result?.code === 'string' ? result.code : 'unavailable', Number.isSafeInteger(result?.retryAfterSeconds) && result.retryAfterSeconds > 0 && result.retryAfterSeconds <= 3600 ? result.retryAfterSeconds : undefined);
        if (action === 'state') {
            if (Object.keys(result).sort().join(',') !== 'code,csrfToken,state' || typeof result.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.csrfToken))
                throw new MerchantSignupError('unavailable');
            csrfToken = result.csrfToken;
        }
        else if (Object.keys(result).sort().join(',') !== 'code,state')
            throw new MerchantSignupError('unavailable');
        return parseState(result.state);
    }
    return Object.freeze({ state: () => request('state') as Promise<MerchantSignupState>, start: input => request('start', { phone: signupPhone(input.phone), operationId: input.operationId }) as Promise<MerchantSignupState>, resend: input => request('resend', { operationId: input.operationId }) as Promise<MerchantSignupState>, verify: input => { if (!/^[0-9]{6}$/.test(input.code))
            return Promise.reject(new MerchantSignupError('invalid_code')); return request('verify', { code: input.code, operationId: input.operationId }) as Promise<Readonly<{
            phase: 'verified';
        }>>; } });
}
