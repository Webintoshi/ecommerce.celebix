import { parseStoreEngagementCampaign, parseStoreEngagementConfig, type StoreEngagementCampaign, type StoreEngagementCampaignKind, type StoreEngagementConfig } from '@celebix/saas-contracts';
export type CampaignInput = Readonly<{
    campaignId?: string;
    expectedVersion?: number;
    kind: StoreEngagementCampaignKind;
    name: string;
    enabled: boolean;
    config: StoreEngagementConfig;
}>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Fence = Readonly<{
    fingerprint: string;
    operationId: string;
    intent: CampaignInput;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MESSAGES: Readonly<Record<string, string>> = {
    invalid_input: 'Bilgileri kontrol edin.', unauthenticated: 'Oturumunuz sona erdi. Yeniden giriş yapın.', membership_denied: 'Bu işlem için yetkiniz yok.', origin_denied: 'Güvenlik doğrulaması başarısız oldu.', store_inactive: 'Mağaza şu anda etkin değil.', feature_not_enabled: 'Bu araç planınızda etkin değil.', rate_limited: 'Çok sık denediniz. Biraz sonra tekrar deneyin.', limit_exceeded: 'Popup sınırına ulaştınız.', image_invalid: 'Seçilen görsel kullanılamıyor.', campaign_unavailable: 'Kampanya şu anda kullanılamıyor.', promotion_unavailable: 'Seçilen kupon şu anda kullanılamıyor.', cart_unavailable: 'Sepet şu anda kullanılamıyor.', contact_conflict: 'İletişim bilgisi başka bir kayıtta kullanılıyor.', invalid_reference: 'Seçilen görsel veya kupon artık kullanılamıyor.', not_found: 'Kayıt bulunamadı.', version_conflict: 'Kayıt başka bir oturumda değişti. Güncel kaydı yükleyin.', operation_mismatch: 'İşlem güvenle tekrarlanamadı.', conflict: 'Bu kayıt zaten var.', unresolved: 'Önceki kayıt sonucu belirsiz. Aynı bilgilerle Uygula düğmesine basarak doğrulayın.', storage_unavailable: 'Tarayıcı kayıt güvencesi oluşturulamadı. Tarayıcı depolamasını açıp sayfayı yenileyin.', unavailable: 'İşlem şu anda tamamlanamadı. Aynı bilgilerle tekrar deneyin.'
};
export class StoreEngagementApiError extends Error {
    constructor(readonly code = 'unavailable', readonly status = 503) {
        super(MESSAGES[code] ?? MESSAGES.unavailable);
        this.name = 'StoreEngagementApiError';
    }
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
        throw new StoreEngagementApiError();
    return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
    return JSON.stringify(value);
}
async function fingerprint(value: unknown) {
    const bytes = new TextEncoder().encode(canonical(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function input(value: CampaignInput): CampaignInput {
    try {
        const required=['kind','name','enabled','config'],allowed=[...required,'campaignId','expectedVersion'];
        if(typeof value!=='object'||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!allowed.includes(key)))throw Error();
        if (!['popup', 'cart_capture'].includes(value.kind) || typeof value.name !== 'string' || value.name !== value.name.trim() || !value.name || value.name.length > 160 || /[\u0000-\u001f\u007f-\u009f]/u.test(value.name) || typeof value.enabled !== 'boolean' || (value.campaignId === undefined) !== (value.expectedVersion === undefined) || (value.campaignId !== undefined && (!UUID.test(value.campaignId) || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion! < 1)))
            throw Error();
        return {
            ...(value.campaignId ? {
                campaignId: value.campaignId, expectedVersion: value.expectedVersion
            } : {}), kind: value.kind, name: value.name, enabled: value.enabled, config: parseStoreEngagementConfig(value.config)
        };
    }
    catch {
        throw new StoreEngagementApiError('invalid_input', 400);
    }
}
async function json(response: Response): Promise<unknown> {
    const length = response.headers.get('content-length');
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json' || (length !== null && (!/^\d+$/.test(length) || Number(length) > 1048576)) || !response.body)
        throw new StoreEngagementApiError();
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            size += next.value.byteLength;
            if (size > 1048576) {
                await reader.cancel();
                throw Error();
            }
            chunks.push(next.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder('utf-8', {
            fatal: true
        }).decode(bytes));
    }
    catch {
        throw new StoreEngagementApiError();
    }
}
function responseError(status: number, value: unknown) {
    let code = 'unavailable';
    try {
        const body = object(value, ['code']);
        if (typeof body.code === 'string' && Object.hasOwn(MESSAGES, body.code) && !['unresolved', 'unavailable'].includes(body.code)) {
            const allowed = status === 400 ? ['invalid_input'] : status === 401 ? ['unauthenticated'] : status === 403 ? ['membership_denied', 'origin_denied', 'store_inactive', 'feature_not_enabled'] : status === 404 ? ['not_found'] : status === 409 ? ['version_conflict', 'operation_mismatch', 'conflict', 'invalid_reference', 'limit_exceeded', 'image_invalid', 'campaign_unavailable', 'promotion_unavailable', 'cart_unavailable', 'contact_conflict'] : status === 429 ? ['rate_limited'] : [];
            if (allowed.includes(body.code))
                code = body.code;
        }
    }
    catch {
    }
    return new StoreEngagementApiError(code, status);
}
export function createStoreEngagementApi(options: Readonly<{
    fetch?: typeof fetch;
    randomUUID?: () => string;
    scope?: string;
    storage?: Storage;
}> = {}) {
    const fetcher = options.fetch ?? ((url, init) => fetch(url, init)), uuid = options.randomUUID ?? (() => crypto.randomUUID());
    if (options.scope !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.scope))
        throw new StoreEngagementApiError('invalid_input', 400);
    const storageKey = options.scope === undefined ? undefined : `celebix.engagement.apply.v1:${options.scope}`;
    let storage = options.storage, fence: Fence | undefined, storageFailed = false, pending = false;
    if (storageKey) {
        try {
            storage ??= typeof window === 'undefined' ? undefined : window.sessionStorage;
            if (!storage && typeof window !== 'undefined')
                throw Error();
            const raw = storage?.getItem(storageKey);
            if (raw) {
                if(raw.length>8192)throw Error();
                const parsed = object(JSON.parse(raw), ['fingerprint', 'operationId','intent']);
                if (typeof parsed.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.fingerprint) || typeof parsed.operationId !== 'string' || !UUID.test(parsed.operationId))
                    throw Error();
                fence = {fingerprint:parsed.fingerprint,operationId:parsed.operationId,intent:input(parsed.intent as CampaignInput)};
            }
        }
        catch {
            storageFailed = true;
        }
    }
    function persist(next: Fence) {
        if (storageFailed)
            throw new StoreEngagementApiError('storage_unavailable');
        try {
            if (storageKey && storage) {
                const raw = JSON.stringify(next);
                storage.setItem(storageKey, raw);
                if (storage.getItem(storageKey) !== raw)
                    throw Error();
            }
            fence = next;
        }
        catch {
            storageFailed = true;
            throw new StoreEngagementApiError('storage_unavailable');
        }
    }
    function clear() {
        try {
            if (storageKey && storage) {
                storage.removeItem(storageKey);
                if (storage.getItem(storageKey) !== null)
                    throw Error();
            }
            fence = undefined;
        }
        catch {
            storageFailed = true;
        }
    }
    async function verifyFence(){
        if(storageFailed)throw new StoreEngagementApiError('storage_unavailable');
        if(fence&&await fingerprint(fence.intent)!==fence.fingerprint){storageFailed=true;throw new StoreEngagementApiError('storage_unavailable');}
    }
    return Object.freeze({
        hasUnresolved: () => Boolean(fence) || storageFailed,
        async pendingIntent():Promise<CampaignInput|null>{await verifyFence();return fence?.intent??null;},
        async list(signal?: AbortSignal): Promise<readonly StoreEngagementCampaign[]> {
            try {
                const response = await fetcher('/api/store-engagement/campaigns', {
                    method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: {
                        accept: 'application/json'
                    }, signal
                });
                const value = await json(response);
                if (!response.ok)
                    throw responseError(response.status, value);
                const envelope = object(value, ['campaigns']);
                if (!Array.isArray(envelope.campaigns) || envelope.campaigns.length > 21)
                    throw Error();
                const campaigns = envelope.campaigns.map(parseStoreEngagementCampaign);
                if (new Set(campaigns.map(c => c.id)).size !== campaigns.length || campaigns.filter(c => c.kind === 'cart_capture').length > 1)
                    throw Error();
                return Object.freeze(campaigns);
            }
            catch (error) {
                if (error instanceof StoreEngagementApiError)
                    throw error;
                throw new StoreEngagementApiError();
            }
        },
        async save(raw: CampaignInput): Promise<StoreEngagementCampaign> {
            const payload = input(raw);
            if (pending)
                throw new StoreEngagementApiError('unresolved');
            pending = true;
            try {
                await verifyFence();
                const hash = await fingerprint(payload);
                if (fence && fence.fingerprint !== hash)
                    throw new StoreEngagementApiError('unresolved');
                const operationId = fence?.operationId ?? uuid();
                if (!UUID.test(operationId))
                    throw new StoreEngagementApiError('invalid_input', 400);
                persist({
                    fingerprint: hash, operationId,intent:payload
                });
                const response = await fetcher('/api/store-engagement/campaigns', {
                    method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: {
                        accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': operationId
                    }, body: JSON.stringify(payload)
                });
                const value = await json(response);
                if (!response.ok) {
                    const error = responseError(response.status, value);
                    if (error.code !== 'unavailable' && error.code !== 'operation_mismatch')
                        clear();
                    throw error;
                }
                const campaign = parseStoreEngagementCampaign(object(value, ['campaign']).campaign);
                if (campaign.kind !== payload.kind || campaign.name !== payload.name || campaign.enabled !== payload.enabled || canonical(campaign.config) !== canonical(payload.config) || (payload.campaignId ? (campaign.id !== payload.campaignId || campaign.version !== payload.expectedVersion! + 1) : campaign.version !== 1))
                    throw new StoreEngagementApiError();
                clear();
                return campaign;
            }
            catch (error) {
                if (error instanceof StoreEngagementApiError)
                    throw error;
                throw new StoreEngagementApiError();
            }
            finally {
                pending = false;
            }
        }
    });
}
const clients = new Map<string, ReturnType<typeof createStoreEngagementApi>>();
export function scopedStoreEngagementApi(scope: string) {
    let client = clients.get(scope);
    if (!client) {
        client = createStoreEngagementApi({
            scope
        });
        clients.set(scope, client);
    }
    return client;
}
