import { parsePromotionAdminListItem, parsePromotionAdminListQuery, parsePromotionAnalyticsDetailResult, parsePromotionAnalyticsQuery, parsePromotionBatchCreateRequest, parsePromotionBatchStatusRequest, parsePromotionCheckRequest, parsePromotionCodeBatchListItem, parsePromotionCodeBatchMutationEnvelope, parsePromotionConflictCheck, parsePromotionCreateRequest, parsePromotionDetail, parsePromotionDuplicateRequest, parsePromotionLegacyProjection, parsePromotionLifecycleTargetRequest, parsePromotionMarginCheck, parsePromotionMutationEnvelope, parsePromotionOverviewResult, parsePromotionPickerResolve, parsePromotionSimulationRequest, parsePromotionSimulatorResponse, parsePromotionTargetListQuery, parsePromotionTargetResolveRequest, parsePromotionUpdateRequest, parsePromotionVersionRequest, type PromotionAdminListItem, type PromotionAnalyticsDetailResult, type PromotionCodeBatchListItem, type PromotionDetail, type PromotionLegacyProjection, type PromotionOverviewResult, type PromotionPickerItem, type PromotionPickerKind } from "@celebix/saas-contracts";
import { promotionRuleDocument, type PromotionDraft, type PromotionTarget } from "./model.ts";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type ListQuery = Readonly<{ cursor?: string; search?: string; effectiveStatuses?: readonly string[]; triggerKinds?: readonly string[]; benefitKinds?: readonly string[]; audienceModes?: readonly string[]; scheduleFrom?: string; scheduleTo?: string }>;
type ApiPage = Readonly<{ items: readonly PromotionAdminListItem[]; nextCursor: string | null }>;
type SaveResult = Readonly<{ kind: "saved"; promotion: PromotionDetail }> | Readonly<{ kind: "conflict"; message: string }> | Readonly<{ kind: "version_conflict"; current: PromotionDetail }>;
const ID = "00000000-0000-4000-8000-000000000001";

function origin(): string { return typeof window === "undefined" ? "https://panel.invalid" : window.location.origin; }
function apiPath(path: string) { return new URL(path, origin()).toString(); }
const SAFE_ERROR_CODES = new Set(["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "origin_denied", "not_found", "operation_mismatch", "conflict", "code_conflict", "active_code_batches", "invalid_transition", "promotion_limit_reached", "version_conflict", "publish_blocked", "invalid_reference", "invalid_code", "not_eligible", "promotion_unavailable"]);
function errorCode(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "promotion_unavailable";
  const body = value as Record<string, unknown>, code = body.code;
  if (typeof code !== "string" || !SAFE_ERROR_CODES.has(code)) return "promotion_unavailable";
  const keys = Object.keys(body).sort().join(",");
  if (code === "version_conflict") return keys === "code,current" ? code : "promotion_unavailable";
  if (code === "publish_blocked") return keys === "code,readiness" ? code : "promotion_unavailable";
  return keys === "code" ? code : "promotion_unavailable";
}
function statusErrorCode(status: number, value: unknown): string {
  const code = errorCode(value);
  const allowed = status === 400 ? ["invalid_input"]
    : status === 401 ? ["unauthenticated"]
      : status === 403 ? ["membership_denied", "store_inactive", "feature_not_enabled", "origin_denied"]
        : status === 404 ? ["not_found"]
          : status === 409 ? ["operation_mismatch", "conflict", "code_conflict", "active_code_batches", "invalid_transition", "promotion_limit_reached", "version_conflict", "publish_blocked", "invalid_reference", "invalid_code", "not_eligible"]
            : status === 503 ? ["promotion_unavailable"] : [];
  return allowed.includes(code) ? code : "promotion_unavailable";
}
function conflictCode(status: number, value: unknown, allowed: readonly string[]): string {
  const code = statusErrorCode(status, value);
  return allowed.includes(code) ? code : "promotion_unavailable";
}
function exact(value: unknown, expected: unknown): boolean { return JSON.stringify(value) === JSON.stringify(expected); }
async function body(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (type !== "application/json" || (length !== null && (!/^\d+$/.test(length) || Number(length) > 1_048_576)) || response.body === null) return {};
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 1_048_576) { await reader.cancel(); return {}; } chunks.push(next.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { try { await reader.cancel(); } catch { /* already closed */ } return {}; }
}
function cursor(value: string | null): boolean { return value === null || /^[A-Za-z0-9_-]{1,2048}$/.test(value); }
function durableIntent(method: string, path: string, payload: string) { return `${method}:${path}:${payload}`; }
type DurableStorage = Readonly<{ getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }>;
type DurableEntry = { id: string; pending: number; uncertain: boolean; family: string };
const DURABLE_STORAGE_KEY = "celebix.promotions.unresolved.v1";
function durableFamily(intent: string): string {
  const first = intent.indexOf(":"), second = intent.indexOf(":", first + 1), path = intent.slice(first + 1, second);
  const batch = /^\/api\/promotions\/code-batches\/([0-9a-f-]+)\/status$/.exec(path); if (batch) return `batch:${batch[1]}`;
  const promotion = /^\/api\/promotions\/([0-9a-f-]+)(?:\/.*)?$/.exec(path); if (promotion) return path.endsWith("/code-batches") ? `codes:${promotion[1]}` : `promotion:${promotion[1]}`;
  return path === "/api/promotions" ? "create" : path;
}
function browserDurableStorage(): DurableStorage | undefined { try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; } }

export function promotionErrorMessage(code: string): string {
  return ({ promotion_operation_unresolved: "Önceki işlem henüz doğrulanamadı. Aynı bilgilerle tekrar deneyin veya sayfayı yenileyerek sonucu kontrol edin.", invalid_input: "Girdiğiniz bilgileri kontrol edip tekrar deneyin.", unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.", membership_denied: "Bu işlem için yetkiniz yok.", store_inactive: "Mağaza etkin olmadığı için işlem yapılamıyor.", feature_not_enabled: "Kampanyalar bu paket için etkin değil.", origin_denied: "Bu işlem yalnız güvenli mağaza panelinden yapılabilir.", not_found: "Kampanya bulunamadı.", version_conflict: "Bu kampanya başka bir değişiklikle güncellendi. Sayfayı yenileyip tekrar deneyin.", operation_mismatch: "Önceki işlemle uyuşmayan bir tekrar algılandı. Sayfayı yenileyin.", conflict: "Kampanya başka bir kampanyayla çakışıyor.", code_conflict: "Bu kupon kodu başka bir kampanyada kullanılıyor.", active_code_batches: "Önce etkin kupon gruplarını durdurun.", invalid_transition: "Kampanya bu durumdan seçilen duruma geçirilemez.", promotion_limit_reached: "Mağazanızın kampanya sınırına ulaşıldı.", publish_blocked: "Kampanya yayın için hazır değil.", invalid_reference: "Seçtiğiniz kayıt artık kullanılamıyor.", invalid_code: "Kupon kodu geçerli değil.", not_eligible: "Kampanya koşulları bu sepet için sağlanmıyor." } as Record<string, string>)[code] ?? "Şu anda işlem tamamlanamadı. Lütfen tekrar deneyin.";
}

export class PromotionApiClient {
  private readonly durableOperations = new Map<string, DurableEntry>();
  private readonly storage: DurableStorage | undefined;
  constructor(private readonly fetcher: Fetch = fetch, private readonly operationId: () => string = () => crypto.randomUUID(), storage?: DurableStorage) { this.storage = storage ?? browserDurableStorage(); this.restoreDurable(); }
  private restoreDurable() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(DURABLE_STORAGE_KEY); if (raw === null) return;
      const entries = JSON.parse(raw) as unknown;
      if (!Array.isArray(entries) || entries.length > 20) throw new Error();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "family,id,intent" ) throw new Error();
        const value = entry as { intent?: unknown; id?: unknown; family?: unknown };
        if (typeof value.intent !== "string" || value.intent.length > 262_144 || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id) || typeof value.family !== "string" || value.family !== durableFamily(value.intent)) throw new Error();
        this.durableOperations.set(value.intent, { id: value.id, pending: 0, uncertain: true, family: value.family });
      }
    } catch { try { this.storage.removeItem(DURABLE_STORAGE_KEY); } catch { /* fail closed in memory */ } }
  }
  private persistDurable() {
    if (!this.storage) return;
    const entries = [...this.durableOperations].filter(([, entry]) => entry.uncertain).slice(-20).map(([intent, entry]) => ({ intent, id: entry.id, family: entry.family }));
    try { if (entries.length) this.storage.setItem(DURABLE_STORAGE_KEY, JSON.stringify(entries)); else this.storage.removeItem(DURABLE_STORAGE_KEY); } catch { /* in-memory lock remains authoritative for this page */ }
  }
  private beginDurable(intent: string): string {
    const current = this.durableOperations.get(intent);
    if (current) { if (current.pending === 0) current.uncertain = false; current.pending += 1; return current.id; }
    const family = durableFamily(intent);
    if ([...this.durableOperations.values()].some((entry) => entry.family === family && entry.uncertain)) throw new Error("promotion_operation_unresolved");
    const created = { id: this.operationId(), pending: 1, uncertain: false, family }; this.durableOperations.set(intent, created); return created.id;
  }
  private settleDurable(intent: string, uncertain: boolean) {
    const current = this.durableOperations.get(intent); if (!current) return;
    current.pending = Math.max(0, current.pending - 1); current.uncertain ||= uncertain;
    if (current.pending === 0 && !current.uncertain) this.durableOperations.delete(intent);
    this.persistDurable();
  }
  async list(query: ListQuery, signal?: AbortSignal): Promise<ApiPage> {
    const safe = parsePromotionAdminListQuery({ limit: 25, ...(query.cursor ? { cursor: query.cursor } : {}), ...(query.search ? { search: query.search } : {}), ...(query.effectiveStatuses?.length ? { effectiveStatuses: query.effectiveStatuses } : {}), ...(query.triggerKinds?.length ? { triggerKinds: query.triggerKinds } : {}), ...(query.benefitKinds?.length ? { benefitKinds: query.benefitKinds } : {}), ...(query.audienceModes?.length ? { audienceModes: query.audienceModes } : {}), ...(query.scheduleFrom ? { scheduleFrom: query.scheduleFrom } : {}), ...(query.scheduleTo ? { scheduleTo: query.scheduleTo } : {}) });
    const params = new URLSearchParams({ limit: String(safe.limit) });
    if (safe.cursor) params.set("cursor", safe.cursor); if (safe.search) params.set("search", safe.search);
    if (safe.effectiveStatuses?.length) params.set("effectiveStatuses", safe.effectiveStatuses.join(","));
    if (safe.triggerKinds?.length) params.set("triggerKinds", safe.triggerKinds.join(","));
    if (safe.benefitKinds?.length) params.set("benefitKinds", safe.benefitKinds.join(","));
    if (safe.audienceModes?.length) params.set("audienceModes", safe.audienceModes.join(","));
    if (safe.scheduleFrom) params.set("scheduleFrom", safe.scheduleFrom);
    if (safe.scheduleTo) params.set("scheduleTo", safe.scheduleTo);
    const response = await this.fetcher(apiPath(`/api/promotions?${params.toString()}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "items,nextCursor" || !Array.isArray((value as { items?: unknown }).items) || !((value as { nextCursor?: unknown }).nextCursor === null || typeof (value as { nextCursor?: unknown }).nextCursor === "string")) throw new Error("promotion_unavailable");
    try {
      const rawItems = (value as { items: readonly unknown[] }).items, nextCursor = (value as { nextCursor: string | null }).nextCursor;
      if (rawItems.length > 25 || !cursor(nextCursor) || (nextCursor !== null && rawItems.length !== 25)) throw new Error();
      const items = Object.freeze(rawItems.map(parsePromotionAdminListItem));
      if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error();
      for (let index = 1; index < items.length; index += 1) { const previous = items[index - 1]!, current = items[index]!; if (previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id)) throw new Error(); }
      return Object.freeze({ items, nextCursor });
    } catch { throw new Error("promotion_unavailable"); }
  }
  async overview(days: 7 | 30 | 90, signal?: AbortSignal): Promise<PromotionOverviewResult> {
    const query = parsePromotionAnalyticsQuery({ days });
    const response = await this.fetcher(apiPath(`/api/promotions/overview?days=${query.days}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    try { const parsed = parsePromotionOverviewResult(value); if (parsed.periodDays !== query.days) throw new Error(); return parsed; }
    catch { throw new Error("promotion_unavailable"); }
  }
  async save(draft: PromotionDraft, promotionId?: string, expectedVersion?: number, expectedStatus?: PromotionDetail["status"]): Promise<SaveResult> {
    const update = promotionId !== undefined;
    const payload = update ? parsePromotionUpdateRequest({ expectedVersion, name: draft.name, ruleDocument: promotionRuleDocument(draft) }) : parsePromotionCreateRequest({ name: draft.name, ruleDocument: promotionRuleDocument(draft) });
    const path = update ? `/api/promotions/${promotionId}` : "/api/promotions", method = update ? "PATCH" : "POST", requestBody = JSON.stringify(payload);
    const intent = durableIntent(method, path, requestBody), operation = this.beginDurable(intent);
    let response: Response; try { response = await this.fetcher(apiPath(path), { method, cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": operation }, body: requestBody }); } catch (error) { this.settleDurable(intent, true); throw error; }
    const value = await body(response); if (response.status === 409) {
      const code = conflictCode(response.status, value, update ? ["operation_mismatch", "code_conflict", "active_code_batches", "invalid_transition", "version_conflict", "publish_blocked", "invalid_reference"] : ["operation_mismatch", "conflict", "code_conflict", "invalid_reference"]); if (code === "promotion_unavailable" || (code === "version_conflict" && !promotionId)) { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } if (code === "version_conflict" && promotionId) { try { const current = parsePromotionDetail((value as { current?: unknown }).current); if (current.id !== promotionId || expectedVersion === undefined || current.version <= expectedVersion) throw new Error(); this.settleDurable(intent, false); return Object.freeze({ kind: "version_conflict", current }); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } }
      if (code === "publish_blocked") { try { const readiness = parsePromotionConflictCheck((value as { readiness?: unknown }).readiness); if (!readiness.blocking) throw new Error(); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } }
      this.settleDurable(intent, false);
      return Object.freeze({ kind: "conflict", message: promotionErrorMessage(code) });
    }
    if (!response.ok) { const code = statusErrorCode(response.status, value); this.settleDurable(intent, response.status >= 500 || code === "promotion_unavailable"); throw new Error(code); }
    try {
      const parsed = parsePromotionMutationEnvelope(value);
      if (!exact(parsed.promotion.name, payload.name) || !exact(parsed.promotion.ruleDocument, payload.ruleDocument) || (update ? response.status !== 200 || parsed.promotion.id !== promotionId || parsed.promotion.version !== expectedVersion! + 1 || expectedStatus === undefined || parsed.promotion.status !== expectedStatus : response.status !== 201 || parsed.promotion.version !== 1 || parsed.promotion.status !== "draft")) throw new Error();
      this.settleDurable(intent, false); return Object.freeze({ kind: "saved", promotion: parsed.promotion });
    } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); }
  }
  async detail(promotionId: string, signal?: AbortSignal): Promise<PromotionDetail> {
    const response = await this.fetcher(apiPath(`/api/promotions/${promotionId}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value)); try { const parsed = parsePromotionDetail(value); if (parsed.id !== promotionId) throw new Error(); return parsed; } catch { throw new Error("promotion_unavailable"); }
  }
  async analytics(promotionId: string, days: 7 | 30 | 90, signal?: AbortSignal): Promise<PromotionAnalyticsDetailResult> {
    const query = parsePromotionAnalyticsQuery({ days });
    const response = await this.fetcher(apiPath(`/api/promotions/${promotionId}/analytics?days=${query.days}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    try { const parsed = parsePromotionAnalyticsDetailResult(value); if (parsed.periodDays !== query.days) throw new Error(); return parsed; }
    catch { throw new Error("promotion_unavailable"); }
  }
  async resolveLegacy(legacyRecordId: string, signal?: AbortSignal): Promise<PromotionLegacyProjection> {
    const response = await this.fetcher(apiPath(`/api/promotions/legacy/${legacyRecordId}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response);
    if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    try {
      const parsed = parsePromotionLegacyProjection(value);
      if (parsed.legacyRecordId !== legacyRecordId) throw new Error();
      return parsed;
    } catch {
      throw new Error("promotion_unavailable");
    }
  }
  async duplicate(promotionId: string, expectedVersion: number, name: string, codes: readonly string[] = []): Promise<SaveResult> {
    const payload = parsePromotionDuplicateRequest({ expectedVersion, name, codes });
    const path = `/api/promotions/${promotionId}/duplicate`, requestBody = JSON.stringify(payload), intent = durableIntent("POST", path, requestBody);
    const operation = this.beginDurable(intent);
    let response: Response; try { response = await this.fetcher(apiPath(path), { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": operation }, body: requestBody }); } catch (error) { this.settleDurable(intent, true); throw error; }
    const value = await body(response);
    if (response.status === 409) { const code = conflictCode(response.status, value, ["operation_mismatch", "conflict", "code_conflict", "invalid_reference", "version_conflict"]); if (code === "promotion_unavailable") { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } if (code === "version_conflict") { try { const current = parsePromotionDetail((value as { current?: unknown }).current); if (current.id !== promotionId || current.version <= expectedVersion) throw new Error(); this.settleDurable(intent, false); return Object.freeze({ kind: "version_conflict", current }); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } } this.settleDurable(intent, false); return Object.freeze({ kind: "conflict", message: promotionErrorMessage(code) }); }
    if (!response.ok) { const code = statusErrorCode(response.status, value); this.settleDurable(intent, response.status >= 500 || code === "promotion_unavailable"); throw new Error(code); }
    try {
      const parsed = parsePromotionMutationEnvelope(value);
      if (response.status !== 201 || parsed.promotion.id === promotionId || parsed.promotion.version !== 1 || parsed.promotion.status !== "draft" || parsed.promotion.name !== payload.name || (payload.codes.length > 0 && !exact(parsed.promotion.ruleDocument.trigger, { kind: "code", codes: payload.codes }))) throw new Error();
      this.settleDurable(intent, false); return Object.freeze({ kind: "saved", promotion: parsed.promotion });
    } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); }
  }
  async listCodeBatches(promotionId: string, cursorValue?: string, signal?: AbortSignal): Promise<Readonly<{ items: readonly PromotionCodeBatchListItem[]; nextCursor: string | null }>> {
    const params = new URLSearchParams({ limit: "25" }); if (cursorValue) params.set("cursor", cursorValue);
    const response = await this.fetcher(apiPath(`/api/promotions/${promotionId}/code-batches?${params}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    try {
      if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "items,nextCursor") throw new Error();
      const page = value as { items: unknown; nextCursor: unknown };
      if (!Array.isArray(page.items) || page.items.length > 25 || !(page.nextCursor === null || typeof page.nextCursor === "string") || !cursor(page.nextCursor) || (page.nextCursor !== null && page.items.length !== 25)) throw new Error();
      const items = Object.freeze(page.items.map(parsePromotionCodeBatchListItem));
      if (items.some((item) => item.promotionId !== promotionId) || new Set(items.map((item) => item.id)).size !== items.length) throw new Error();
      return Object.freeze({ items, nextCursor: page.nextCursor });
    } catch { throw new Error("promotion_unavailable"); }
  }
  async createCodeBatch(promotionId: string, input: Readonly<{ count: number; prefix: string; codeLength: number; perCustomerUsage: number; expiresAt: string | null }>) {
    const payload = parsePromotionBatchCreateRequest(input), path = `/api/promotions/${promotionId}/code-batches`, requestBody = JSON.stringify(payload), intent = durableIntent("POST", path, requestBody), operation = this.beginDurable(intent);
    let response: Response; try { response = await this.fetcher(apiPath(path), { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": operation }, body: requestBody }); } catch (error) { this.settleDurable(intent, true); throw error; }
    const value = await body(response); if (!response.ok) { const code = response.status === 409 ? conflictCode(response.status, value, ["operation_mismatch", "code_conflict"]) : statusErrorCode(response.status, value); this.settleDurable(intent, response.status >= 500 || code === "promotion_unavailable"); throw new Error(code); }
    try { const parsed = parsePromotionCodeBatchMutationEnvelope(value); if (response.status !== 201 || parsed.batch.promotionId !== promotionId || parsed.batch.version !== 1 || parsed.batch.status !== "active") throw new Error(); this.settleDurable(intent, false); return parsed.batch; }
    catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); }
  }
  async updateCodeBatch(batch: PromotionCodeBatchListItem, nextStatus: "active" | "paused" | "revoked") {
    const payload = parsePromotionBatchStatusRequest({ expectedVersion: batch.version, nextStatus }), path = `/api/promotions/code-batches/${batch.id}/status`, requestBody = JSON.stringify(payload), intent = durableIntent("POST", path, requestBody), operation = this.beginDurable(intent);
    let response: Response; try { response = await this.fetcher(apiPath(path), { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": operation }, body: requestBody }); } catch (error) { this.settleDurable(intent, true); throw error; }
    const value = await body(response); if (!response.ok) { const code = response.status === 409 ? conflictCode(response.status, value, ["operation_mismatch", "version_conflict", "invalid_transition"]) : statusErrorCode(response.status, value); if (code === "version_conflict") { try { const current = parsePromotionCodeBatchListItem((value as { current?: unknown }).current); if (current.id !== batch.id || current.promotionId !== batch.promotionId || current.version <= batch.version) throw new Error(); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } } this.settleDurable(intent, response.status >= 500 || code === "promotion_unavailable"); throw new Error(code); }
    try { const parsed = parsePromotionCodeBatchMutationEnvelope(value); if (parsed.batch.id !== batch.id || parsed.batch.promotionId !== batch.promotionId || parsed.batch.version !== batch.version + 1 || parsed.batch.status !== nextStatus) throw new Error(); this.settleDurable(intent, false); return parsed.batch; }
    catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); }
  }
  async targets(kind: PromotionPickerKind, query: Readonly<{ cursor?: string; search?: string }>, signal?: AbortSignal): Promise<Readonly<{ items: readonly PromotionTarget[]; nextCursor: string | null }>> {
    const safe = parsePromotionTargetListQuery({ kind, limit: 25, ...(query.cursor ? { cursor: query.cursor } : {}), ...(query.search ? { search: query.search } : {}) }); const params = new URLSearchParams({ kind: safe.kind, limit: String(safe.limit) }); if (safe.cursor) params.set("cursor", safe.cursor); if (safe.search) params.set("search", safe.search);
    const response = await this.fetcher(apiPath(`/api/promotions/targets?${params}`), { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value));
    const parsed = value as { items?: readonly unknown[]; nextCursor?: string | null }; if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join(",") !== "items,nextCursor" || !Array.isArray(parsed.items) || !(parsed.nextCursor === null || typeof parsed.nextCursor === "string")) throw new Error("promotion_unavailable");
    try { const ids = parsed.items.map((item) => (item as { id?: unknown }).id); if (ids.some((id) => typeof id !== "string") || parsed.items.length > 25 || !cursor(parsed.nextCursor) || (parsed.nextCursor !== null && parsed.items.length !== 25)) throw new Error(); return Object.freeze({ items: ids.length === 0 ? Object.freeze([]) : parsePromotionPickerResolve({ items: parsed.items }, kind, ids as string[]), nextCursor: parsed.nextCursor }); } catch { throw new Error("promotion_unavailable"); }
  }
  async resolveTargets(kind: PromotionPickerKind, ids: readonly string[], signal?: AbortSignal): Promise<readonly PromotionTarget[]> {
    if (ids.length === 0) return Object.freeze([]);
    const payload = parsePromotionTargetResolveRequest({ kind, ids });
    const response = await this.fetcher(apiPath("/api/promotions/targets/resolve"), { method: "POST", cache: "no-store", credentials: "same-origin", signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value)); try { return parsePromotionPickerResolve(value, kind, [...ids]); } catch { throw new Error("promotion_unavailable"); }
  }
  async lifecycle(promotionId: string, expectedVersion: number, action: "publish" | "pause" | "resume" | "archive", nextStatus: "active" | "scheduled" = "active") {
    const payload = action === "publish" || action === "resume" ? parsePromotionLifecycleTargetRequest({ expectedVersion, nextStatus }) : parsePromotionVersionRequest({ expectedVersion });
    const path = `/api/promotions/${promotionId}/${action}`, requestBody = JSON.stringify(payload), intent = durableIntent("POST", path, requestBody);
    const operation = this.beginDurable(intent);
    let response: Response; try { response = await this.fetcher(apiPath(path), { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": operation }, body: requestBody }); } catch (error) { this.settleDurable(intent, true); throw error; }
    const value = await body(response); if (response.status === 409) { const code = conflictCode(response.status, value, action === "publish" || action === "resume" ? ["operation_mismatch", "version_conflict", "invalid_transition", "invalid_reference", "promotion_limit_reached", "publish_blocked"] : action === "archive" ? ["operation_mismatch", "version_conflict", "invalid_transition"] : ["operation_mismatch", "version_conflict", "invalid_transition"]); if (code === "promotion_unavailable") { this.settleDurable(intent, true); throw new Error(code); }
      if (code === "version_conflict") { try { const current = parsePromotionDetail((value as { current?: unknown }).current); if (current.id !== promotionId || current.version <= expectedVersion) throw new Error(); this.settleDurable(intent, false); return Object.freeze({ kind: "version_conflict" as const, current }); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } }
      if (code === "publish_blocked") { try { const readiness = parsePromotionConflictCheck((value as { readiness?: unknown }).readiness); if (!readiness.blocking) throw new Error(); this.settleDurable(intent, false); return Object.freeze({ kind: "publish_blocked" as const, readiness }); } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); } }
      this.settleDurable(intent, false);
      return Object.freeze({ kind: "conflict" as const, message: promotionErrorMessage(code) });
    }
    if (!response.ok) { const code = statusErrorCode(response.status, value); this.settleDurable(intent, response.status >= 500 || code === "promotion_unavailable"); throw new Error(code); }
    try {
      const parsed = parsePromotionMutationEnvelope(value), expectedStatus = action === "pause" ? "paused" : action === "archive" ? "archived" : nextStatus;
      if (response.status !== 200 || parsed.promotion.id !== promotionId || parsed.promotion.version !== expectedVersion + 1 || parsed.promotion.status !== expectedStatus) throw new Error();
      this.settleDurable(intent, false); return Object.freeze({ kind: "saved" as const, promotion: parsed.promotion });
    } catch { this.settleDurable(intent, true); throw new Error("promotion_unavailable"); }
  }
  async check(draft: PromotionDraft, promotionId?: string, expectedVersion?: number, signal?: AbortSignal) {
    const checked = parsePromotionCheckRequest(promotionId ? { promotionId, expectedVersion, ruleDocument: promotionRuleDocument(draft) } : { ruleDocument: promotionRuleDocument(draft) });
    const request = async (path: "conflicts" | "margin") => { const response = await this.fetcher(apiPath(`/api/promotions/${path}`), { method: "POST", cache: "no-store", credentials: "same-origin", signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(checked) }); const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value)); return value; };
    const [rawConflicts, rawMargin] = await Promise.all([request("conflicts"), request("margin")]);
    let conflicts, margin; try { conflicts = parsePromotionConflictCheck(rawConflicts); margin = parsePromotionMarginCheck(rawMargin); } catch { throw new Error("promotion_unavailable"); }
    return Object.freeze({ conflicts, margin });
  }
  async simulate(draft: PromotionDraft, input: Readonly<{ promotionId: string; expectedVersion: number | null; context: Record<string, unknown> }>, signal?: AbortSignal) {
    const ruleDocument = promotionRuleDocument(draft);
    const payload = parsePromotionSimulationRequest({ promotionId: input.promotionId, expectedVersion: input.expectedVersion, name: draft.name, ruleDocument, context: input.context });
    const response = await this.fetcher(apiPath("/api/promotions/simulate"), { method: "POST", cache: "no-store", credentials: "same-origin", signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
    const value = await body(response); if (!response.ok) throw new Error(statusErrorCode(response.status, value)); try { return parsePromotionSimulatorResponse(value); } catch { throw new Error("promotion_unavailable"); }
  }
  mergeTargetSelections(current: readonly PromotionTarget[], page: readonly PromotionTarget[]): readonly PromotionTarget[] { const found = new Map(current.map((item) => [`${item.kind}:${item.id}`, item])); for (const item of page) if (!found.has(`${item.kind}:${item.id}`)) found.set(`${item.kind}:${item.id}`, item); return Object.freeze([...found.values()]); }
  displayTargetSelections(selected: readonly PromotionTarget[], resolved: readonly PromotionPickerItem[]): readonly PromotionTarget[] { const found = new Map(resolved.map((item) => [`${item.kind}:${item.id}`, item])); return Object.freeze(selected.map((item) => found.get(`${item.kind}:${item.id}`) ?? { ...item, label: "Artık kullanılamıyor — kaldır", status: "unavailable" as const })); }
  reconcileTargetSelections(current: readonly PromotionTarget[], selected: readonly PromotionTarget[], kind: PromotionPickerKind, resolved: readonly PromotionPickerItem[]): readonly PromotionTarget[] {
    const currentById = new Map(current.map((item) => [`${item.kind}:${item.id}`, item]));
    const resolvedById = new Map(resolved.map((item) => [`${item.kind}:${item.id}`, item]));
    return Object.freeze(selected.map((item) => item.kind === kind
      ? resolvedById.get(`${item.kind}:${item.id}`) ?? { ...item, label: "Artık kullanılamıyor — kaldır", status: "unavailable" as const }
      : currentById.get(`${item.kind}:${item.id}`) ?? item));
  }
}

export class PromotionListLoader {
  private generation = 0; private controller: AbortController | null = null;
  constructor(private readonly client: PromotionApiClient) {}
  async load(query: ListQuery): Promise<ApiPage | null> { this.controller?.abort(); const controller = new AbortController(); this.controller = controller; const generation = ++this.generation; try { const page = await this.client.list(query, controller.signal); return generation === this.generation ? page : null; } catch (error) { if (controller.signal.aborted || generation !== this.generation) return null; throw error; } }
  dispose() { this.controller?.abort(); }
}

export class PromotionTargetPageLoader {
  private generation = 0; private controller: AbortController | null = null;
  constructor(private readonly client: PromotionApiClient) {}
  invalidate() { this.generation += 1; this.controller?.abort(); this.controller = null; }
  async load(kind: PromotionPickerKind, query: Readonly<{ cursor: string; search?: string }>) {
    this.controller?.abort(); const controller = new AbortController(); this.controller = controller; const generation = ++this.generation;
    try { const page = await this.client.targets(kind, query, controller.signal); return generation === this.generation ? page : null; }
    catch (error) { if (controller.signal.aborted || generation !== this.generation) return null; throw error; }
  }
  dispose() { this.invalidate(); }
}

export const promotionApi = new PromotionApiClient();
