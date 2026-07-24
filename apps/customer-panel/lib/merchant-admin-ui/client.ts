import {
  MERCHANT_ADMIN_PROVIDER_RECORD_KINDS,
  MERCHANT_ADMIN_RECORD_KINDS,
  parseMerchantAdminEvent,
  parseMerchantAdminMutationResult,
  parseMerchantAdminProviderJob,
  parseMerchantAdminProviderJobMutationResult,
  parseMerchantAdminRecord,
  type MerchantAdminJson,
  type MerchantAdminProviderRecordKind,
  type MerchantAdminRecordKind,
} from "@celebix/saas-contracts";

const CODES = ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "record_not_found", "invalid_transition", "version_conflict", "operation_mismatch", "operation_not_found", "durable_authority_invalid", "unavailable"] as const;
type Code = (typeof CODES)[number];
const MESSAGES: Record<Code, string> = { invalid_input: "Gönderilen bilgiler geçersiz.", unauthenticated: "Oturumunuz sona erdi.", membership_denied: "Bu işlem için yetkiniz yok.", store_inactive: "Mağaza işlemlere kapalı.", feature_not_enabled: "Bu özellik planınızda etkin değil.", record_not_found: "Kayıt bulunamadı.", invalid_transition: "Bu işlem artık uygulanamaz.", version_conflict: "Kayıt sizden önce güncellendi.", operation_mismatch: "İşlem güvenle tekrar edilemedi.", operation_not_found: "İşlem kanıtı bulunamadı.", durable_authority_invalid: "Yetki yeniden doğrulanamadı.", unavailable: "Bu bölüm şu anda kullanılamıyor." };
export class MerchantAdminApiError extends Error { constructor(readonly code: Code, readonly status: number) { super(MESSAGES[code]); this.name = "MerchantAdminApiError"; } }
type Fetch = typeof fetch;
function record(value: unknown) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
async function json(response: Response) { if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new MerchantAdminApiError("unavailable", response.status || 503); try { return await response.json(); } catch { throw new MerchantAdminApiError("unavailable", 503); } }
function kind(value: MerchantAdminRecordKind) { if (!MERCHANT_ADMIN_RECORD_KINDS.includes(value)) throw new TypeError("merchant_admin_client_invalid"); return value; }
function providerKind(value: MerchantAdminProviderRecordKind) { if (!MERCHANT_ADMIN_PROVIDER_RECORD_KINDS.includes(value)) throw new TypeError("merchant_admin_client_invalid"); return value; }
function opaqueId(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new TypeError("merchant_admin_client_invalid"); return value; }

export function createMerchantAdminApi(fetcher: Fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  async function request(path: string, init?: RequestInit) { const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }), value = await json(response); if (!response.ok) { const parsed = record(value), code = parsed && typeof parsed.code === "string" && CODES.includes(parsed.code as Code) ? parsed.code as Code : "unavailable"; throw new MerchantAdminApiError(code, response.status); } return value; }
  function post(path: string, value: unknown) { return request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": uuid() }, body: JSON.stringify(value) }); }
  function items<T>(value: unknown, parser: (entry: unknown) => T): readonly T[] { const parsed = record(value); if (!parsed || Object.keys(parsed).join(",") !== "items" || !Array.isArray(parsed.items)) throw new MerchantAdminApiError("unavailable", 503); return Object.freeze(parsed.items.map(parser)); }
  return Object.freeze({
    async records(recordKind: MerchantAdminRecordKind) { return items(await request(`/api/merchant-admin/records/${kind(recordKind)}`), parseMerchantAdminRecord); },
    async record(recordKind: MerchantAdminRecordKind, recordId: string) { const expectedKind = kind(recordKind), expectedId = opaqueId(recordId); let result; try { result = parseMerchantAdminRecord(await request(`/api/merchant-admin/records/${expectedKind}/${expectedId}`)); } catch (error) { if (error instanceof MerchantAdminApiError) throw error; throw new MerchantAdminApiError("unavailable", 503); } if (result.kind !== expectedKind || result.id !== expectedId) throw new MerchantAdminApiError("unavailable", 503); return result; },
    async events(recordKind: MerchantAdminRecordKind) { return items(await request(`/api/merchant-admin/events/${kind(recordKind)}`), parseMerchantAdminEvent); },
    async providerJobs(recordKind: MerchantAdminProviderRecordKind) { return items(await request(`/api/merchant-admin/provider-jobs/${providerKind(recordKind)}`), parseMerchantAdminProviderJob); },
    async save(recordKind: MerchantAdminRecordKind, value: Readonly<{ recordId?: string; expectedVersion?: number; name: string; config: Readonly<Record<string, MerchantAdminJson>>; status: "draft" | "active" }>) { return parseMerchantAdminMutationResult(await post(`/api/merchant-admin/records/${kind(recordKind)}`, value)); },
    async archive(recordKind: MerchantAdminRecordKind, recordId: string, expectedVersion: number) { return parseMerchantAdminMutationResult(await post(`/api/merchant-admin/records/${kind(recordKind)}/${encodeURIComponent(recordId)}/archive`, { expectedVersion })); },
    async prepareProviderJob(recordKind: MerchantAdminProviderRecordKind, recordId: string, expectedRecordVersion: number) { return parseMerchantAdminProviderJobMutationResult(await post(`/api/merchant-admin/provider-jobs/${providerKind(recordKind)}`, { recordId, expectedRecordVersion })); },
    async cancelProviderJob(recordKind: MerchantAdminProviderRecordKind, jobId: string, expectedVersion: number) { return parseMerchantAdminProviderJobMutationResult(await post(`/api/merchant-admin/provider-jobs/${providerKind(recordKind)}/${encodeURIComponent(jobId)}/cancel`, { expectedVersion })); },
  });
}
export const merchantAdminApi = createMerchantAdminApi();
