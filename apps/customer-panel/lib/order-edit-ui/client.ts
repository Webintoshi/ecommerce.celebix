import { parseOrderEditIntent, parseOrderEditWorkspace, parseOrderEditProducts, parseOrderEditPreview, parseOrderEditResult, type OrderEditIntent, type OrderEditWorkspace, type OrderEditProducts, type OrderEditPreview, type OrderEditResult } from '@celebix/saas-contracts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const MESSAGES: Readonly<Record<string, string>> = { invalid_input: 'Alanları kontrol ederek yeniden deneyin.', unauthenticated: 'Oturumunuz sona erdi. Yeniden giriş yapın.', membership_denied: 'Bu siparişi düzenleme yetkiniz yok.', price_permission_denied: 'Ürün fiyatını değiştirme yetkiniz yok.', discount_denied: 'İndirim, yetki sınırınızı aşıyor.', discount_limit_exceeded: 'İndirim, yetki sınırınızı aşıyor.', store_inactive: 'Mağaza şu anda işlem yapmaya kapalı.', feature_not_enabled: 'Sipariş düzenleme bu mağazada etkin değil.', order_not_found: 'Sipariş bulunamadı.', version_conflict: 'Sipariş değişti. Girdiğiniz bilgileri koruduk; güncel siparişi kontrol edin.', preview_conflict: 'Sipariş veya stok değişti. Bilgileri kontrol ederek yeniden deneyin.', preview_mismatch: 'Sipariş veya stok değişti. Bilgileri kontrol ederek yeniden deneyin.', inventory_conflict: 'Seçilen ürün için yeterli stok yok.', catalog_conflict: 'Ürün veya varyant artık kullanılamıyor.', customer_conflict: 'Müşteri bilgileri doğrulanamadı. İletişim alanlarını kontrol edin.', invalid_transition: 'Bu sipariş mevcut durumunda düzenlenemiyor.', operation_mismatch: 'Kayıt işlemi aynı bilgilerle doğrulanamadı.', durable_authority_invalid: 'Sipariş yetkisi yeniden doğrulanamadı.', unavailable: 'Kayıt sonucu doğrulanamadı. Aynı kaydı doğrulayarak devam edin.' };
const BLOCK_REASONS = new Set(['currency_unsupported', 'order_archived', 'order_fulfilled', 'shipment_exists', 'return_exists', 'payment_in_progress_or_refunded', 'settlement_discount_exceeds_total']);
const SETTLEMENT_MESSAGE = 'Yeni tutar, daha önce uygulanan tahsilat iskontosundan düşük olamaz.';
export class OrderEditUiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly knownSafe: boolean;
    constructor(code: string, status: number, blockReason?: string) { super(blockReason === 'settlement_discount_exceeds_total' ? SETTLEMENT_MESSAGE : MESSAGES[code] ?? 'İşlem tamamlanamadı. Bilgileriniz korunuyor.'); this.name = 'OrderEditUiError'; this.code = code; this.status = status; this.knownSafe = code !== 'unavailable' && Object.hasOwn(MESSAGES, code) && [400, 403, 409].includes(status); }
}
function invalid(): never { throw new TypeError('order_edit_ui_invalid'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(); const fields = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key) || !('value' in fields[key]) || !fields[key].enumerable))
    invalid(); return value as Record<string, unknown>; }
function uuid(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value))
    invalid(); return value; }
function hash(value: unknown): string { if (typeof value !== 'string' || !HASH.test(value))
    invalid(); return value; }
export type PendingOrderEdit = Readonly<{
    schemaVersion: 1;
    orderId: string;
    operationId: string;
    previewFingerprint: string;
    intent: OrderEditIntent;
}>;
export type OrderEditApplyInput = Readonly<{
    intent: OrderEditIntent;
    operationId: string;
    previewFingerprint: string;
}>;
export type OrderEditStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function parsePending(value: unknown, orderId: string): PendingOrderEdit { const r = object(value, ['schemaVersion', 'orderId', 'operationId', 'previewFingerprint', 'intent']); if (r.schemaVersion !== 1 || uuid(r.orderId) !== uuid(orderId))
    invalid(); return Object.freeze({ schemaVersion: 1, orderId, operationId: uuid(r.operationId), previewFingerprint: hash(r.previewFingerprint), intent: parseOrderEditIntent(r.intent) }); }
function journalKey(hostname: string, orderId: string) { if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostname))
    invalid(); return `celebix.order-edit.v1:${hostname}:${uuid(orderId)}`; }
export function readPendingEdit(storage: OrderEditStorage, hostname: string, orderId: string): PendingOrderEdit | null { const raw = storage.getItem(journalKey(hostname, orderId)); if (raw === null)
    return null; if (raw.length > 262144)
    invalid(); return parsePending(JSON.parse(raw), orderId); }
export function persistPendingEdit(storage: OrderEditStorage, hostname: string, orderId: string, value: PendingOrderEdit): void { const pending = parsePending(value, orderId), key = journalKey(hostname, orderId), serialized = JSON.stringify(pending); storage.setItem(key, serialized); if (storage.getItem(key) !== serialized)
    throw new Error('order_edit_journal_unverified'); const read = readPendingEdit(storage, hostname, orderId); if (JSON.stringify(read) !== serialized)
    throw new Error('order_edit_journal_unverified'); }
export function clearPendingEdit(storage: OrderEditStorage, hostname: string, orderId: string): void { const key = journalKey(hostname, orderId); storage.removeItem(key); if (storage.getItem(key) !== null)
    throw new Error('order_edit_journal_not_cleared'); }
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
async function jsonBody(response: Response): Promise<unknown> { if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw Error('invalid_json'); const reader = response.body?.getReader(); if (!reader)
    throw Error('missing_json'); const chunks: Uint8Array[] = []; let total = 0; for (;;) {
    const next = await reader.read();
    if (next.done)
        break;
    total += next.value.byteLength;
    if (total > 1048576) {
        void reader.cancel();
        throw Error('large_json');
    }
    chunks.push(next.value);
} const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
} return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
export function createOrderEditUiClient(options: Readonly<{
    fetch?: Fetch;
    randomUUID?: () => string;
}> = {}) {
    object(options, Object.keys(options));
    if (Object.keys(options).some(k => k !== 'fetch' && k !== 'randomUUID'))
        invalid();
    const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    const newId = () => uuid((options.randomUUID ?? (() => crypto.randomUUID()))());
    async function request<T>(orderId: string, suffix: string, parse: (value: unknown) => T, body?: unknown, signal?: AbortSignal): Promise<T> {
        let response: Response;
        try {
            response = await fetchImpl(`/api/orders/${uuid(orderId)}/edit${suffix}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}), ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
        }
        catch (failure) {
            if (body === undefined && failure instanceof Error && failure.name === 'AbortError')
                throw failure;
            throw new OrderEditUiError('unavailable', 503);
        }
        let payload: unknown;
        try {
            payload = await jsonBody(response);
        }
        catch {
            throw new OrderEditUiError('unavailable', 503);
        }
        if (!response.ok) {
            let code = 'unavailable', blockReason: string | undefined;
            try {
                const r = object(payload, ['code', ...(Object.hasOwn(payload as object, 'blockReason') ? ['blockReason'] : [])]);
                if (Object.hasOwn(r, 'blockReason') && (typeof r.blockReason !== 'string' || !BLOCK_REASONS.has(r.blockReason)))
                    invalid();
                if (typeof r.code === 'string' && Object.hasOwn(MESSAGES, r.code)) {
                    code = r.code;
                    blockReason = r.blockReason as string | undefined;
                }
            }
            catch { }
            throw new OrderEditUiError(code, response.status, blockReason);
        }
        try {
            return parse(payload);
        }
        catch {
            throw new OrderEditUiError('unavailable', 503);
        }
    }
    return Object.freeze({ newId,
        async workspace(orderId: string, signal?: AbortSignal): Promise<OrderEditWorkspace> { return request(orderId, '', value => { const result = parseOrderEditWorkspace(value); if (result.orderId !== orderId)
            invalid(); return result; }, undefined, signal); },
        async products(orderId: string, search: string, signal?: AbortSignal): Promise<OrderEditProducts> { if (typeof search !== 'string' || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search))
            invalid(); const q = new URLSearchParams({ search, limit: '30' }); return request(orderId, '/products?' + q.toString(), parseOrderEditProducts, undefined, signal); },
        async preview(orderId: string, intent: OrderEditIntent): Promise<OrderEditPreview> { const exact = parseOrderEditIntent(intent); return request(orderId, '/preview', value => { const result = parseOrderEditPreview(value); if (result.orderId !== orderId || result.expectedVersion !== exact.expectedVersion)
            invalid(); return result; }, exact); },
        async apply(orderId: string, input: OrderEditApplyInput): Promise<OrderEditResult> { const r = object(input, ['intent', 'operationId', 'previewFingerprint']); const body = { intent: parseOrderEditIntent(r.intent), operationId: uuid(r.operationId), previewFingerprint: hash(r.previewFingerprint) }; return request(orderId, '', value => { const result = parseOrderEditResult(value); if (result.orderId !== orderId || result.operationId !== body.operationId || result.version !== body.intent.expectedVersion + 1 || result.preview.fingerprint !== body.previewFingerprint)
            invalid(); return result; }, body); },
    });
}
export type OrderEditUiClient = ReturnType<typeof createOrderEditUiClient>;
export const orderEditUi = createOrderEditUiClient();
