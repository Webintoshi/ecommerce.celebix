import { parseOrderBumpSettings, parseOrderBumpWorkspace, parseOrderBumpOptionsPage, type OrderBumpSettings, type OrderBumpWorkspace, type OrderBumpOptionsPage } from '@celebix/saas-contracts';

export type OrderBumpSaveInput = Readonly<{ expectedVersion: number; config: OrderBumpSettings }>;
export type OrderBumpOptionKind = 'product' | 'category' | 'variant';
export type OrderBumpOptionsInput = Readonly<{ kind: OrderBumpOptionKind; page?: number; search?: string; productId?: string; ids?: readonly string[] }>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Fence = Readonly<{ operationId: string; intent: OrderBumpSaveInput }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MESSAGES: Readonly<Record<string, string>> = {
  invalid_input: 'Bilgileri kontrol edin.', unauthenticated: 'Oturumunuz sona erdi. Yeniden giriş yapın.', membership_denied: 'Bu işlem için yetkiniz yok.', origin_denied: 'Güvenlik doğrulaması başarısız oldu.', store_inactive: 'Mağaza şu anda etkin değil.',
  invalid_reference: 'Seçilen ürün veya seçenek artık kullanılamıyor. Seçimleri kontrol edin.', version_conflict: 'Ayarlar başka bir oturumda değişti. Girişleriniz korunuyor.', operation_mismatch: 'Önceki kayıt güvenle doğrulanamadı. Girişleriniz korunuyor.',
  unresolved: 'Önceki kayıt sonucu belirsiz. Aynı kaydı doğrulayın.', storage_unavailable: 'Tarayıcı kayıt güvencesi oluşturulamadı. Tarayıcı depolamasını kontrol edin.', unavailable: 'İşlem tamamlanamadı. Girişleriniz korunuyor; yeniden deneyin.',
};
export class OrderBumpsApiError extends Error {
  constructor(readonly code = 'unavailable', readonly status = 503) { super(MESSAGES[code] ?? MESSAGES.unavailable); this.name = 'OrderBumpsApiError'; }
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new OrderBumpsApiError();
  return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
  return JSON.stringify(value);
}
function saveInput(value: OrderBumpSaveInput): OrderBumpSaveInput {
  try { exact(value, ['expectedVersion', 'config']); if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) throw Error(); return { expectedVersion: value.expectedVersion, config: parseOrderBumpSettings(value.config) }; }
  catch { throw new OrderBumpsApiError('invalid_input', 400); }
}
async function json(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' || (length !== null && (!/^\d+$/.test(length) || Number(length) > 1_048_576)) || !response.body) throw new OrderBumpsApiError();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 1_048_576) { await reader.cancel(); throw Error(); } chunks.push(next.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new OrderBumpsApiError(); }
}
function responseError(status: number, value: unknown) {
  let code = 'unavailable';
  try {
    const parsed = exact(value, ['code']), allowed: Readonly<Record<number, readonly string[]>> = { 400: ['invalid_input'], 401: ['unauthenticated'], 403: ['membership_denied', 'origin_denied', 'store_inactive'], 409: ['invalid_reference', 'version_conflict', 'operation_mismatch'] };
    if (typeof parsed.code === 'string' && allowed[status]?.includes(parsed.code)) code = parsed.code;
  } catch { /* An unrecognized outcome remains unresolved. */ }
  return new OrderBumpsApiError(code, status);
}

export function createOrderBumpsApi(options: Readonly<{ fetch?: typeof fetch; randomUUID?: () => string; scope?: string; storage?: Storage }> = {}) {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init)), uuid = options.randomUUID ?? (() => crypto.randomUUID());
  if (options.scope !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.scope)) throw new OrderBumpsApiError('invalid_input', 400);
  const key = options.scope === undefined ? undefined : `celebix.order-bumps.apply.v1:${options.scope}`;
  let storage = options.storage, fence: Fence | undefined, receipt: OrderBumpWorkspace | undefined, rejected = false, pending = false, storageFailed = false;
  if (key) {
    try {
      storage ??= typeof window === 'undefined' ? undefined : window.sessionStorage;
      if (!storage && typeof window !== 'undefined') throw Error();
      const raw = storage?.getItem(key);
      if (raw) { if (raw.length > 65_536) throw Error(); const parsed = exact(JSON.parse(raw), ['operationId', 'intent']); if (typeof parsed.operationId !== 'string' || !UUID.test(parsed.operationId)) throw Error(); fence = { operationId: parsed.operationId, intent: saveInput(parsed.intent as OrderBumpSaveInput) }; }
    } catch { storageFailed = true; }
  }
  function persist(next: Fence) {
    if (storageFailed) { if (fence && fence.operationId === next.operationId && canonical(fence.intent) === canonical(next.intent)) return; throw new OrderBumpsApiError('storage_unavailable'); }
    try { if (key && storage) { const raw = JSON.stringify(next); storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw Error(); } fence = next; }
    catch { storageFailed = true; throw new OrderBumpsApiError('storage_unavailable'); }
  }
  function clear() {
    try { if (key && storage) { storage.removeItem(key); if (storage.getItem(key) !== null) throw Error(); } fence = undefined; receipt = undefined; rejected = false; }
    catch { storageFailed = true; throw new OrderBumpsApiError('storage_unavailable'); }
  }
  async function get(signal?: AbortSignal): Promise<OrderBumpWorkspace> {
    try { const response = await fetcher('/api/order-bumps', { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal }); const value = await json(response); if (!response.ok) throw responseError(response.status, value); return parseOrderBumpWorkspace(exact(value, ['workspace']).workspace); }
    catch (error) { if (error instanceof OrderBumpsApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error; throw new OrderBumpsApiError(); }
  }
  return Object.freeze({
    get,
    hasUnresolved: () => Boolean(fence) && !receipt && !rejected,
    persistenceAvailable: () => !storageFailed,
    pendingIntent(): OrderBumpSaveInput | null { if (receipt || rejected) return null; if (storageFailed && !fence) throw new OrderBumpsApiError('storage_unavailable'); return fence?.intent ?? null; },
    async save(raw: OrderBumpSaveInput): Promise<OrderBumpWorkspace> {
      const intent = saveInput(raw);
      if ((receipt || rejected) && storageFailed) throw new OrderBumpsApiError('storage_unavailable');
      if (pending || (fence && canonical(fence.intent) !== canonical(intent))) throw new OrderBumpsApiError('unresolved');
      pending = true;
      try {
        const operationId = fence?.operationId ?? uuid(); if (!UUID.test(operationId)) throw new OrderBumpsApiError('invalid_input', 400);
        persist({ operationId, intent });
        const response = await fetcher('/api/order-bumps', { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': operationId }, body: JSON.stringify(intent) });
        const value = await json(response);
        if (!response.ok) { const error = responseError(response.status, value); if (error.code !== 'unavailable' && error.code !== 'operation_mismatch') { rejected = true; try { clear(); } catch { /* A definitive rejection allows exit while the old journal fences new writes. */ } } throw error; }
        const saved = parseOrderBumpWorkspace(exact(value, ['workspace']).workspace);
        if (saved.version <= intent.expectedVersion || saved.updatedAt === null || canonical(saved.config) !== canonical(intent.config)) throw new OrderBumpsApiError();
        receipt = saved;
        try { clear(); } catch { /* The verified outcome permits exit; the retained journal still fences later writes. */ }
        return saved;
      } catch (error) { if (error instanceof OrderBumpsApiError) throw error; throw new OrderBumpsApiError(); }
      finally { pending = false; }
    },
    async options(input: OrderBumpOptionsInput, signal?: AbortSignal): Promise<OrderBumpOptionsPage> {
      try {
        if (!input || !['product', 'category', 'variant'].includes(input.kind) || Object.keys(input).some(name => !['kind', 'page', 'search', 'productId', 'ids'].includes(name)) || (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 1)) || (input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 100)) || (input.productId !== undefined && (input.kind !== 'variant' || !UUID.test(input.productId))) || (input.ids !== undefined && (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 400 || new Set(input.ids).size !== input.ids.length || input.ids.some(id => !UUID.test(id)) || input.search !== undefined || input.productId !== undefined || (input.page !== undefined && input.page !== 1)))) throw new OrderBumpsApiError('invalid_input', 400);
        const params = new URLSearchParams({ kind: input.kind, page: String(input.page ?? 1) });
        if (input.search?.trim()) params.set('search', input.search.trim()); if (input.productId) params.set('productId', input.productId); if (input.ids) params.set('ids', input.ids.join(','));
        const response = await fetcher('/api/order-bumps/options?' + params, { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal }); const value = await json(response); if (!response.ok) throw responseError(response.status, value);
        return parseOrderBumpOptionsPage(exact(value, ['options']).options);
      } catch (error) { if (error instanceof OrderBumpsApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error; throw new OrderBumpsApiError(); }
    },
  });
}
export type OrderBumpsApi = ReturnType<typeof createOrderBumpsApi>;
const scopedApis = new Map<string, OrderBumpsApi>();
export function scopedOrderBumpsApi(scope: string): OrderBumpsApi { let api = scopedApis.get(scope); if (!api) { api = createOrderBumpsApi({ scope }); scopedApis.set(scope, api); } return api; }
