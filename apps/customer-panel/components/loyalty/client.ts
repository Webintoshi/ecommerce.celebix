import { parseLoyaltyAdminResult, parseLoyaltyProgramList, parseLoyaltyReport, type LoyaltyProgramMutation } from "@celebix/saas-contracts";

const KEY = "celebix.loyalty.pending.v1";
export const LOYALTY_PENDING_EVENT = "celebix-loyalty-pending";
function notifyPending() { if (typeof window !== "undefined") window.dispatchEvent(new Event(LOYALTY_PENDING_EVENT)); }
type Pending = Readonly<{ action: string; operationId: string; payload: Record<string, unknown> }>;
export class LoyaltyRequestError extends Error {
  constructor(readonly code: string, readonly uncertain = false) { super(code); }
}
export function loyaltyError(error: unknown): string {
  if (!(error instanceof LoyaltyRequestError)) return "İşlem tamamlanamadı. Bilgileriniz korunuyor; yeniden deneyin.";
  if (error.uncertain) return "İşlemin sonucu henüz doğrulanamadı. Aynı işlemi yeniden deneyerek sonucu kontrol edin.";
  return ({ unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.", membership_denied: "Bu işlem için yetkiniz yok.", feature_not_enabled: "İndirimler mağazanızın paketinde etkin değil.", version_conflict: "Program başka bir işlemle değişti. Güncel kaydı yükleyip tekrar kontrol edin.", invalid_reference: "Seçtiğiniz ürün veya kargo yöntemi artık kullanılamıyor.", invalid_input: "Girdiğiniz bilgileri kontrol edin.", not_found: "Program bulunamadı.", program_limit_reached: "Etkin program sınırına ulaşıldı. Kullanılmayan bir programı duraklatın.", operation_mismatch: "Önceki işlemi doğruladıktan sonra yeniden deneyin." } as Record<string, string>)[error.code] ?? "İşlem tamamlanamadı. Bilgileriniz korunuyor; yeniden deneyin.";
}
async function responseBody(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.startsWith("application/json")) throw new LoyaltyRequestError("unavailable", true);
  const raw = await response.text();
  if (raw.length > 1_048_576) throw new LoyaltyRequestError("unavailable", true);
  try { return JSON.parse(raw); } catch { throw new LoyaltyRequestError("unavailable", true); }
}
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } }); }
  catch (error) { if (init.signal?.aborted) throw error; throw new LoyaltyRequestError("unavailable", Boolean(init.body)); }
  const value = await responseBody(response);
  if (!response.ok) throw new LoyaltyRequestError(typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : "unavailable", response.status >= 500);
  return value;
}
export async function listLoyaltyPrograms(signal?: AbortSignal) { return parseLoyaltyProgramList(await request("/api/loyalty", { signal })); }
export async function readLoyaltyReport(programId: string, cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
  const report = parseLoyaltyReport(await request(`/api/loyalty/${encodeURIComponent(programId)}/report?${params}`, { signal }));
  if (report.program.id !== programId) throw new LoyaltyRequestError("unavailable");
  return report;
}
export function pendingLoyaltyOperation(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY); if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("action" in value) || !("operationId" in value) || !("payload" in value) || typeof value.action !== "string" || !["save", "pause", "duplicate", "adjust"].includes(value.action) || typeof value.operationId !== "string" || !/^[0-9a-f-]{36}$/.test(value.operationId) || typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) return null;
    return value as Pending;
  } catch { return null; }
}
export async function loyaltyCommand(action: "save" | "pause" | "duplicate" | "adjust", payload: Record<string, unknown>, retry = false): Promise<unknown> {
  const old = pendingLoyaltyOperation();
  if (old && !retry && (old.action !== action || JSON.stringify(old.payload) !== JSON.stringify(payload))) throw new LoyaltyRequestError("unavailable", true);
  const intent = old ?? { action, payload, operationId: crypto.randomUUID() };
  if (old && (intent.action !== action || JSON.stringify(intent.payload) !== JSON.stringify(payload))) throw new LoyaltyRequestError("operation_mismatch", true);
  try { sessionStorage.setItem(KEY, JSON.stringify(intent)); } catch { throw new LoyaltyRequestError("unavailable"); }
  try {
    const result = await request(`/api/loyalty/${action}`, { method: "POST", body: JSON.stringify({ operationId: intent.operationId, payload: intent.payload }) });
    if (typeof result !== "object" || result === null || !("operationId" in result) || result.operationId !== intent.operationId) throw new LoyaltyRequestError("unavailable", true);
    if (action === "adjust") {
      const parsed = parseLoyaltyAdminResult(action, result);
      if (parsed.programId !== payload.programId || parsed.customerId !== payload.customerId) throw new LoyaltyRequestError("unavailable", true);
    } else {
      const parsed = parseLoyaltyAdminResult(action, result), program = parsed.program;
      if (action === "duplicate") {
        if (program.id === payload.programId || program.version !== 1) throw new LoyaltyRequestError("unavailable", true);
      } else {
        if (payload.programId !== undefined && program.id !== payload.programId || program.version !== (typeof payload.expectedVersion === "number" ? payload.expectedVersion + 1 : 1)) throw new LoyaltyRequestError("unavailable", true);
        if (action === "pause" && program.status !== "paused") throw new LoyaltyRequestError("unavailable", true);
        if (action === "save" && (program.name !== payload.name || JSON.stringify(program.config) !== JSON.stringify(payload.config) || payload.enabled === false && program.status !== "paused")) throw new LoyaltyRequestError("unavailable", true);
      }
    }
    sessionStorage.removeItem(KEY);
    notifyPending();
    return result;
  } catch (error) {
    if (error instanceof LoyaltyRequestError && !error.uncertain) sessionStorage.removeItem(KEY);
    notifyPending();
    if (!(error instanceof LoyaltyRequestError)) throw new LoyaltyRequestError("unavailable", true);
    throw error;
  }
}
export async function mutateLoyaltyProgram(action: "save" | "pause" | "duplicate", payload: Record<string, unknown>, retry = false): Promise<LoyaltyProgramMutation> { return await loyaltyCommand(action, payload, retry) as LoyaltyProgramMutation; }
