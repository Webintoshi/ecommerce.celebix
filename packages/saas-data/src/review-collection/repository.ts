import { createHash, randomUUID } from "node:crypto";
import { parseReviewCollectionOverview, parseReviewCollectionSettings, parseReviewInvitation, parseReviewSubmission, type ReviewCollectionOverview, type ReviewCollectionSettings, type ReviewInvitation, type ReviewSubmission, type TenantContext } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from "../postgres/pool.ts";
import { catalogAuthority } from "../catalog/validation.ts";

export class ReviewCollectionError extends Error { constructor(readonly code: string) { super("review_collection_failed"); } }
export type ReviewCollectionEmail = Readonly<{ fromLabel: string; to: string; subject: string; html: string; text: string }>;
export type ReviewCollectionClaim = Readonly<{ id: string; leaseId: string; attemptCount: number; firstAttemptAt?: string; email?: ReviewCollectionEmail; recipient: string; storeName: string; productTitle: string; origin: string }>;
export type ReviewCollectionSendResult = Readonly<{ kind: "accepted"; providerMessageId: string } | { kind: "retryable" | "permanent"; code: string }>;
export type ReviewCollectionAuthority = Readonly<{ tenantContext: TenantContext; now: Date }>;
export interface ReviewCollectionRepository {
  overview(input: ReviewCollectionAuthority): Promise<ReviewCollectionOverview>;
  saveSettings(input: ReviewCollectionAuthority & Readonly<{ operationId: string; expectedVersion: number; enabled: boolean; delayDays: number }>): Promise<ReviewCollectionSettings>;
  requestOrder(input: ReviewCollectionAuthority & Readonly<{ operationId: string; orderId: string; expectedVersion: number }>): Promise<Readonly<{ queuedCount: number }>>;
  invitation(input: Readonly<{ hostname: string; now: Date; token: string }>): Promise<ReviewInvitation>;
  submit(input: Readonly<{ hostname: string; now: Date; token: string; operationId: string; review: ReviewSubmission }>): Promise<Readonly<{ status: "pending" }>>;
  unsubscribe(input: Readonly<{ hostname: string; now: Date; token: string }>): Promise<void>;
  claim(input: Readonly<{ now: Date; leaseId: string }>): Promise<readonly ReviewCollectionClaim[]>;
  seal(input: Readonly<{ id: string; leaseId: string; now: Date; tokenHash: string; email: ReviewCollectionEmail }>): Promise<ReviewCollectionEmail | null>;
  finish(input: Readonly<{ id: string; leaseId: string; now: Date; result: ReviewCollectionSendResult }>): Promise<void>;
}
export type PostgresReviewCollectionRepositoryOptions = Readonly<{ pool: PostgresPoolLike; role: "celebix_saas_app" | "celebix_saas_host_resolver" | "celebix_saas_workflow"; timeouts: PostgresTimeoutOptions }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function invalid(): never { throw new ReviewCollectionError("invalid_input"); }
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function now(value: unknown): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewCollectionError("unavailable"); return value as Record<string, unknown>; }
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
function text(value: unknown, max: number): string { if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) invalid(); return value; }
export function reviewInvitationTokenHash(token: string): string { if (!/^[A-Za-z0-9_-]{43}$/u.test(token) || Buffer.from(token, "base64url").toString("base64url") !== token || Buffer.from(token, "base64url").length !== 32) invalid(); return createHash("sha256").update(token).digest("hex"); }
function hostname(value: string): string { if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value) || value.includes("..")) invalid(); return value; }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function authority(input: ReviewCollectionAuthority): unknown[] { const a = catalogAuthority(input.tenantContext, input.now); return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now]; }
function email(value: unknown): ReviewCollectionEmail { const r = object(value); if (Object.keys(r).sort().join(",") !== "fromLabel,html,subject,text,to") throw new ReviewCollectionError("unavailable"); const to = text(r.to, 320); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to)) invalid(); return Object.freeze({ fromLabel: text(r.fromLabel, 120), to, subject: text(r.subject, 250), html: text(r.html, 20000), text: text(r.text, 10000) }); }

export class PostgresReviewCollectionRepository implements ReviewCollectionRepository {
  private readonly options: PostgresReviewCollectionRepositoryOptions;
  constructor(options: PostgresReviewCollectionRepositoryOptions) {
    if (!options || !options.pool || typeof options.pool.connect !== "function" || !["celebix_saas_app", "celebix_saas_host_resolver", "celebix_saas_workflow"].includes(options.role) || !options.timeouts || Object.values(options.timeouts).some(v => !Number.isSafeInteger(v) || v < 1 || v > 60000)) throw new ReviewCollectionError("unavailable");
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async rpc(name: string, values: unknown[], expected: readonly string[], role: PostgresReviewCollectionRepositoryOptions["role"]): Promise<unknown> {
    if (this.options.role !== role) throw new ReviewCollectionError("unavailable");
    let client; try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw new ReviewCollectionError("unavailable"); }
    let terminal = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true),pg_catalog.set_config('lock_timeout',$2,true),pg_catalog.set_config('idle_in_transaction_session_timeout',$3,true)", [`${this.options.timeouts.statementMs}ms`, `${this.options.timeouts.lockMs}ms`, `${this.options.timeouts.idleTransactionMs}ms`]);
      await client.query(`SET LOCAL ROLE ${role}`);
      const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, i) => `$${i + 1}`).join(",")})`, values);
      if (result.rowCount !== 1 || result.rows.length !== 1) throw new ReviewCollectionError("unavailable");
      const r = object(result.rows[0]); if (!expected.includes(String(r.outcome))) throw new ReviewCollectionError(typeof r.outcome === "string" ? r.outcome : "unavailable");
      await client.query("COMMIT"); terminal = true; client.release(); return r.result_payload;
    } catch (caught) {
      if (!terminal) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } }
      if (caught instanceof ReviewCollectionError) throw caught;
      throw new ReviewCollectionError("unavailable");
    }
  }
  async overview(input: ReviewCollectionAuthority) { return parseReviewCollectionOverview(await this.rpc("review_collection_admin_overview", authority(input), ["found"], "celebix_saas_app")); }
  async saveSettings(input: ReviewCollectionAuthority & Readonly<{ operationId: string; expectedVersion: number; enabled: boolean; delayDays: number }>) {
    const config = parseReviewCollectionSettings({ enabled: input.enabled, delayDays: input.delayDays, version: input.expectedVersion });
    const value = { enabled: config.enabled, delayDays: config.delayDays, expectedVersion: config.version };
    return parseReviewCollectionSettings(await this.rpc("review_collection_admin_mutate", [...authority(input), uuid(input.operationId), fingerprint([input.tenantContext.store.id, "settings", value]), "settings", JSON.stringify(value)], ["saved", "operation_replayed"], "celebix_saas_app"));
  }
  async requestOrder(input: ReviewCollectionAuthority & Readonly<{ operationId: string; orderId: string; expectedVersion: number }>) {
    const value = { orderId: uuid(input.orderId), expectedVersion: integer(input.expectedVersion, 1) };
    const result = object(await this.rpc("review_collection_admin_mutate", [...authority(input), uuid(input.operationId), fingerprint([input.tenantContext.store.id, "request", value]), "request", JSON.stringify(value)], ["saved", "operation_replayed"], "celebix_saas_app"));
    return Object.freeze({ queuedCount: integer(result.queuedCount, 0, 100) });
  }
  async invitation(input: Readonly<{ hostname: string; now: Date; token: string }>) { return parseReviewInvitation(await this.rpc("review_collection_public", [hostname(input.hostname), now(input.now), reviewInvitationTokenHash(input.token), "get", null, null, null], ["found"], "celebix_saas_host_resolver")); }
  async submit(input: Readonly<{ hostname: string; now: Date; token: string; operationId: string; review: ReviewSubmission }>) {
    const draft = parseReviewSubmission(input.review), hash = reviewInvitationTokenHash(input.token);
    const result = object(await this.rpc("review_collection_public", [hostname(input.hostname), now(input.now), hash, "submit", uuid(input.operationId), fingerprint([hostname(input.hostname), hash, draft]), JSON.stringify(draft)], ["submitted", "operation_replayed"], "celebix_saas_host_resolver"));
    if (result.status !== "pending" || Object.keys(result).length !== 1) throw new ReviewCollectionError("unavailable");
    return Object.freeze({ status: "pending" as const });
  }
  async unsubscribe(input: Readonly<{ hostname: string; now: Date; token: string }>) { await this.rpc("review_collection_public", [hostname(input.hostname), now(input.now), reviewInvitationTokenHash(input.token), "unsubscribe", null, null, null], ["unsubscribed"], "celebix_saas_host_resolver"); }
  async claim(input: Readonly<{ now: Date; leaseId: string }>): Promise<readonly ReviewCollectionClaim[]> {
    const leaseId = uuid(input.leaseId), result = object(await this.rpc("review_collection_work_claim", [now(input.now), leaseId], ["claimed"], "celebix_saas_workflow"));
    if (!Array.isArray(result.items) || result.items.length > 25) throw new ReviewCollectionError("unavailable");
    return Object.freeze(result.items.map(value => {
      const r = object(value); if (r.leaseId !== leaseId) throw new ReviewCollectionError("unavailable");
      const origin = text(r.origin, 260), parsed = new URL(origin); if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) throw new ReviewCollectionError("unavailable");
      return Object.freeze({ id: uuid(r.id), leaseId, attemptCount: integer(r.attemptCount, 1, 8), ...(r.firstAttemptAt === undefined ? {} : { firstAttemptAt: text(r.firstAttemptAt, 40) }), ...(r.email === undefined ? {} : { email: email(r.email) }), recipient: text(r.recipient, 320), storeName: text(r.storeName, 120), productTitle: text(r.productTitle, 200), origin });
    }));
  }
  async seal(input: Readonly<{ id: string; leaseId: string; now: Date; tokenHash: string; email: ReviewCollectionEmail }>) {
    if (!/^[a-f0-9]{64}$/u.test(input.tokenHash)) invalid();
    const result = await this.rpc("review_collection_work_seal", [uuid(input.id), uuid(input.leaseId), now(input.now), input.tokenHash, JSON.stringify(email(input.email))], ["sealed", "suppressed"], "celebix_saas_workflow"); return result === null ? null : email(result);
  }
  async finish(input: Readonly<{ id: string; leaseId: string; now: Date; result: ReviewCollectionSendResult }>) {
    const code = input.result.kind === "accepted" ? input.result.providerMessageId : input.result.code;
    if (!["accepted", "retryable", "permanent"].includes(input.result.kind)) invalid();
    await this.rpc("review_collection_work_finish", [uuid(input.id), uuid(input.leaseId), now(input.now), input.result.kind, text(code, 200)], ["finished"], "celebix_saas_workflow");
  }
}
export function createReviewCollectionLeaseId(): string { return randomUUID(); }
