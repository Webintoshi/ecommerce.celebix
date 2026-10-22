import { parseStoreToolOffer, parseStoreToolPurchaseIntent, parseStoreToolPurchase, parseStoreToolWorkspace, type StoreToolOffer, type StoreToolPurchase, type StoreToolPurchaseIntent } from '@celebix/saas-contracts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MESSAGES: Readonly<Record<string, string>> = { invalid_input: 'Talep bilgilerini kontrol edin.', unauthenticated: 'Oturumunuz sona erdi. Yeniden giriş yapın.', membership_denied: 'Satın alma talebi oluşturma yetkiniz yok.', store_inactive: 'Mağaza şu anda işlem yapmaya kapalı.', feature_not_enabled: 'Bu araç şu anda kullanılamıyor.', durable_authority_invalid: 'Mağaza yetkisi doğrulanamadı.', origin_denied: 'Talep bu oturumdan doğrulanamadı.', operation_mismatch: 'Önceki talebin sonucu aynı bilgilerle doğrulanamadı.', quote_changed: 'Fiyat güncellendi. Yeni tutarı kontrol ederek yeniden talep oluşturun.', already_owned: 'Bu araç mağazanızda zaten açık. Durumu yenileyin.', purchase_pending: 'Bu araç için açık bir satın alma talebi var. Durumu yenileyin.', unavailable: 'Talebin sonucu doğrulanamadı. Aynı talebi doğrulayarak devam edin.', commit_unknown: 'Talebin sonucu doğrulanamadı. Aynı talebi doğrulayarak devam edin.' };
export class StoreToolsUiError extends Error {
    readonly knownSafe: boolean;
    constructor(readonly code: string, readonly status: number) { super(MESSAGES[code] ?? MESSAGES.unavailable); this.name = 'StoreToolsUiError'; this.knownSafe = status === 400 && code === 'invalid_input' || status === 409 && ['quote_changed', 'already_owned', 'purchase_pending'].includes(code); }
}
function invalid(): never { throw TypeError('store_tools_ui_invalid'); }
function uuid(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value))
    invalid(); return value; }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(); const fields = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key) || !('value' in fields[key]!) || !fields[key]!.enumerable))
    invalid(); return value as Record<string, unknown>; }
export type PendingToolPurchase = Readonly<{
    schemaVersion: 1;
    storeId: string;
    intent: StoreToolPurchaseIntent;
    offer: StoreToolOffer;
}>;
export type ToolPurchaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function parsePendingPurchase(value: unknown, storeId: string): PendingToolPurchase { const r = exact(value, ['schemaVersion', 'storeId', 'intent', 'offer']); if (r.schemaVersion !== 1 || uuid(r.storeId) !== uuid(storeId))
    invalid(); const intent = parseStoreToolPurchaseIntent(r.intent), offer = parseStoreToolOffer(r.offer); if (intent.offerId !== offer.id || intent.quoteFingerprint !== offer.quoteFingerprint)
    invalid(); return Object.freeze({ schemaVersion: 1, storeId, intent, offer }); }
function journalKey(hostname: string, storeId: string) { if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostname))
    invalid(); return `celebix.store-tools.v1:${hostname}:${uuid(storeId)}`; }
export function readPendingPurchase(storage: ToolPurchaseStorage, hostname: string, storeId: string): PendingToolPurchase | null { const value = storage.getItem(journalKey(hostname, storeId)); if (value === null)
    return null; if (value.length > 8192)
    invalid(); return parsePendingPurchase(JSON.parse(value), storeId); }
export function persistPendingPurchase(storage: ToolPurchaseStorage, hostname: string, value: PendingToolPurchase): void { const pending = parsePendingPurchase(value, value.storeId), key = journalKey(hostname, pending.storeId), serialized = JSON.stringify(pending); storage.setItem(key, serialized); if (storage.getItem(key) !== serialized || JSON.stringify(readPendingPurchase(storage, hostname, pending.storeId)) !== serialized)
    throw Error('store_tools_journal_unverified'); }
export function clearPendingPurchase(storage: ToolPurchaseStorage, hostname: string, storeId: string): void { const key = journalKey(hostname, storeId); storage.removeItem(key); if (storage.getItem(key) !== null)
    throw Error('store_tools_journal_not_cleared'); }
export function purchaseMatchesPending(value: StoreToolPurchase, pending: PendingToolPurchase): boolean { return value.id === pending.intent.operationId && value.storeId === pending.storeId && value.offerId === pending.intent.offerId && value.offerName === pending.offer.name && value.currency === pending.offer.currency && value.netCents === pending.offer.netCents && value.vatBps === pending.offer.vatBps && value.vatCents === pending.offer.vatCents && value.totalCents === pending.offer.totalCents && value.toolKeys.length === pending.offer.toolKeys.length && value.toolKeys.every(key => pending.offer.toolKeys.includes(key)); }
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
async function json(response: Response): Promise<unknown> { if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw Error('invalid_json'); const reader = response.body?.getReader(); if (!reader)
    throw Error('missing_json'); let total = 0; const chunks: Uint8Array[] = []; try {
    for (;;) {
        const next = await reader.read();
        if (next.done)
            break;
        total += next.value.byteLength;
        if (total > 524288) {
            await reader.cancel();
            throw Error('large_json');
        }
        chunks.push(next.value);
    }
}
finally {
    reader.releaseLock();
} const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
} return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
export function createStoreToolsUiClient(options: Readonly<{
    fetch?: Fetch;
    randomUUID?: () => string;
}> = {}) {
    const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    async function request<T>(path: string, parse: (value: unknown) => T, body?: StoreToolPurchaseIntent, signal?: AbortSignal): Promise<T> { let response: Response, payload: unknown; try {
        response = await fetcher(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}), ...(body ? { headers: { 'content-type': 'application/json', 'idempotency-key': body.operationId }, body: JSON.stringify(body) } : {}) });
        payload = await json(response);
    }
    catch (error) {
        if (!body && error instanceof Error && error.name === 'AbortError')
            throw error;
        throw new StoreToolsUiError('unavailable', 503);
    } if (!response.ok) {
        let code = 'unavailable';
        try {
            const row = exact(payload, ['code']);
            if (typeof row.code === 'string' && Object.hasOwn(MESSAGES, row.code))
                code = row.code;
        }
        catch { }
        throw new StoreToolsUiError(code, response.status);
    } try {
        return parse(payload);
    }
    catch {
        throw new StoreToolsUiError('unavailable', 503);
    } }
    return Object.freeze({ newId: () => uuid((options.randomUUID ?? (() => crypto.randomUUID()))()), read: (signal?: AbortSignal) => request('/api/store-tools', parseStoreToolWorkspace, undefined, signal), request: (value: PendingToolPurchase) => { const pending = parsePendingPurchase(value, value.storeId); return request('/api/store-tools/requests', payload => { const purchase = parseStoreToolPurchase(payload); if (!purchaseMatchesPending(purchase, pending))
            invalid(); return purchase; }, pending.intent); } });
}
export type StoreToolsUiClient = ReturnType<typeof createStoreToolsUiClient>;
export const storeToolsUi = createStoreToolsUiClient();
