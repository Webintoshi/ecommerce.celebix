import { normalizeStoreAdminInvitationEmail, parseStoreAdminInvitationView, STORE_ADMIN_INVITATION_DELIVERY_STATUSES, type StoreAdminInvitationRole, type StoreAdminInvitationView, type StoreAdminInvitationDeliveryStatus } from "@celebix/saas-contracts";
import type { PostgresClientLike, PostgresPoolLike, PostgresTimeoutOptions } from "@celebix/saas-data";

export interface InvitationAuthority { storeId: string; principalId: string; membershipId: string; planId: string; planCode: string; planVersion: number }
const FAILURES = ["invalid_input", "membership_denied", "store_inactive", "durable_authority_invalid", "feature_not_enabled", "invalid_source", "version_conflict", "invitation_unavailable", "operation_not_found", "operation_conflict", "already_converted", "rate_limited", "unverified_identity", "email_mismatch", "revoked_membership", "configuration_unavailable", "stale_lease"] as const;
export type InvitationFailure = (typeof FAILURES)[number] | "unavailable" | "commit_unknown" | "configuration_blocked";
export type InvitationResult<K extends string, T> = Readonly<{ kind: K; value: T } | { kind: InvitationFailure }>;
export interface InvitationSource { sourceRecordId: string; sourceRecordVersion: number; storeId: string; storeName: string; email: string; displayName: string; role: StoreAdminInvitationRole; expiresAt: string }
export interface InvitationResendSource extends InvitationSource { invitationId: string; generation: number; version: number }
export interface InvitationCandidate { invitationId: string; deliveryId: string; tokenDigest: string; generation: number; sealVersion: "ar1"; keyId: string; ciphertext: string; ciphertextDigest: string; rendererVersion: 1 }
export interface InvitationOperation { operationId: string; fingerprint: string; now: Date }
export interface InvitationProof { grantDigest: string; browserKeyId: string; browserDigest: string; now: Date }
export interface InvitationGrantInput { invitationId: string; generation: number; tokenDigest: string; browserKeyId: string; browserDigest: string; issuer: string; subject: string; email: string; emailVerified: boolean; grantId: string; grantDigest: string; operationId: string; fingerprint: string; now: Date; expiresAt: Date }
export interface InvitationGrant { grantId: string; invitationId: string; generation: number; expiresAt: string }
/** Server-only: never serialize issuer/subject to a browser response. */
export interface InvitationGrantPreview extends InvitationGrant { storeId: string; storeName: string; email: string; displayName: string; role: StoreAdminInvitationRole; issuer: string; subject: string; accepted: boolean }
export interface InvitationAcceptance { invitationId: string; storeId: string; principalId: string; membershipId: string; role: StoreAdminInvitationRole | "store_owner"; adminHostname: string }
export interface InvitationDeliveryJob { deliveryId: string; invitationId: string; storeId: string; generation: number; sealVersion: "ar1" | "ai1"; keyId: string; ciphertext: string; ciphertextDigest: string; rendererVersion: 1; idempotencyKey: string; attemptCount: number; firstAttemptAt: string; replayDeadline: string }
export interface InvitationLease { deliveryId: string; leaseId: string; workerId: string; now: Date }
export interface InvitationAuthorization { deliveryId: string; invitationId: string; storeId: string; generation: number; attemptCount: number; leaseExpiresAt: string }
export type InvitationSafeError = "provider_rejected" | "provider_timeout" | "provider_rate_limited" | "provider_unavailable" | "configuration_unavailable" | "invalid_response";
export interface InvitationSettlement extends InvitationLease { resultKind: "provider_accepted" | "retry" | "failed" | "outcome_unknown"; providerMessageId: string | null; safeErrorCode: InvitationSafeError | null; nextAttemptAt: Date | null }
export interface InvitationClaim { workerId: string; leaseId: string; now: Date; leaseExpiresAt: Date; limit: number }
export interface InvitationIdentityRepository {
  list(a: InvitationAuthority, now: Date): Promise<InvitationResult<"listed", { items: readonly StoreAdminInvitationView[]; hasMore: boolean }>>;
  source(a: InvitationAuthority, input: { sourceRecordId: string; expectedRecordVersion: number; now: Date }): Promise<InvitationResult<"source", InvitationSource>>;
  resendSource(a: InvitationAuthority, input: { invitationId: string; expectedVersion: number; now: Date }): Promise<InvitationResult<"source", InvitationResendSource>>;
  issue(a: InvitationAuthority, input: InvitationOperation & { sourceRecordId: string; expectedRecordVersion: number; candidate: InvitationCandidate }): Promise<InvitationResult<"issued" | "operation_replayed", StoreAdminInvitationView>>;
  resend(a: InvitationAuthority, input: InvitationOperation & { invitationId: string; expectedVersion: number; candidate: InvitationCandidate }): Promise<InvitationResult<"resent" | "operation_replayed", StoreAdminInvitationView>>;
  revoke(a: InvitationAuthority, input: InvitationOperation & { invitationId: string; expectedVersion: number }): Promise<InvitationResult<"revoked" | "operation_replayed", StoreAdminInvitationView>>;
  recoverOperation(a: InvitationAuthority, input: InvitationOperation): Promise<InvitationResult<"operation_replayed", StoreAdminInvitationView>>;
  resolve(tokenDigest: string, now: Date): Promise<InvitationResult<"resolved", Omit<InvitationSource, "sourceRecordId" | "sourceRecordVersion" | "storeName"> & { invitationId: string; generation: number }>>;
  grant(input: InvitationGrantInput): Promise<InvitationResult<"granted" | "operation_replayed", InvitationGrant>>;
  grantPreview(input: InvitationProof): Promise<InvitationResult<"grant_available", InvitationGrantPreview>>;
  accept(input: InvitationProof & InvitationOperation & { principalId: string; membershipId: string }): Promise<InvitationResult<"accepted" | "operation_replayed", InvitationAcceptance>>;
  recoverAcceptance(input: InvitationProof & InvitationOperation): Promise<InvitationResult<"operation_replayed", InvitationAcceptance>>;
}
export interface InvitationWorkflowRepository {
  /** Synchronous local validation only, inside claim transaction. No network calls. */
  claim(input: InvitationClaim, allow: (job: InvitationDeliveryJob) => boolean): Promise<InvitationResult<"claimed", { items: readonly InvitationDeliveryJob[] }>>;
  authorize(input: InvitationLease): Promise<InvitationResult<"authorized", InvitationAuthorization>>;
  settle(input: InvitationSettlement): Promise<InvitationResult<"settled" | "operation_replayed", { deliveryId: string; deliveryStatus: StoreAdminInvitationDeliveryStatus }>>;
}
interface Dependencies { pool: PostgresPoolLike; timeouts: PostgresTimeoutOptions }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function invalid(): never { throw new Error("store_admin_invitation_repository_invalid"); }
function exact(v: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) invalid();
  const keys = Reflect.ownKeys(v), descriptors = Object.getOwnPropertyDescriptors(v);
  if (keys.length !== fields.length || keys.some(k => typeof k !== "string" || !fields.includes(k)) || fields.some(k => !descriptors[k]?.enumerable || !("value" in descriptors[k]!))) invalid();
  return Object.fromEntries(fields.map(k => [k, descriptors[k]!.value]));
}
function str(v: unknown, max = 160): string { if (typeof v !== "string" || !v || v.length > max || v !== v.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(v)) invalid(); return v; }
function uuid(v: unknown) { const s = str(v, 36); if (!UUID.test(s)) invalid(); return s; }
function positive(v: unknown): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) invalid(); return v; }
function timestamp(v: unknown): string { const s = str(v, 24); if (new Date(s).toISOString() !== s) invalid(); return s; }
function role(v: unknown): StoreAdminInvitationRole { if (v !== "admin" && v !== "editor" && v !== "analyst") invalid(); return v; }
function email(v: unknown): string { const result = normalizeStoreAdminInvitationEmail(v); if (result !== v) invalid(); return result; }
function source(v: unknown, resend = false): InvitationSource | InvitationResendSource {
  const r = exact(v, ["sourceRecordId", "sourceRecordVersion", "storeId", "storeName", "email", "displayName", "role", "expiresAt", ...(resend ? ["invitationId", "generation", "version"] : [])]);
  const base = { sourceRecordId: uuid(r.sourceRecordId), sourceRecordVersion: positive(r.sourceRecordVersion), storeId: uuid(r.storeId), storeName: str(r.storeName), email: email(r.email), displayName: str(r.displayName), role: role(r.role), expiresAt: timestamp(r.expiresAt) };
  return Object.freeze(resend ? { ...base, invitationId: uuid(r.invitationId), generation: positive(r.generation), version: positive(r.version) } : base);
}
function grant(v: unknown): InvitationGrant { const r = exact(v, ["grantId", "invitationId", "generation", "expiresAt"]); return Object.freeze({ grantId: uuid(r.grantId), invitationId: uuid(r.invitationId), generation: positive(r.generation), expiresAt: timestamp(r.expiresAt) }); }
function acceptance(v: unknown): InvitationAcceptance {
  const r = exact(v, ["invitationId", "storeId", "principalId", "membershipId", "role", "adminHostname"]);
  const host = str(r.adminHostname, 253);
  if (host !== host.toLowerCase() || !host.includes(".") || host.split(".").some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part))) invalid();
  return Object.freeze({ invitationId: uuid(r.invitationId), storeId: uuid(r.storeId), principalId: uuid(r.principalId), membershipId: uuid(r.membershipId), role: r.role === "store_owner" ? "store_owner" : role(r.role), adminHostname: host });
}
function job(v: unknown): InvitationDeliveryJob {
  const r = exact(v, ["deliveryId", "invitationId", "storeId", "generation", "sealVersion", "keyId", "ciphertext", "ciphertextDigest", "rendererVersion", "idempotencyKey", "attemptCount", "firstAttemptAt", "replayDeadline"]);
  const invitationId = uuid(r.invitationId), generation = positive(r.generation), attemptCount = positive(r.attemptCount);
  if (attemptCount > 8 || (r.sealVersion !== "ar1" && r.sealVersion !== "ai1") || r.rendererVersion !== 1 || typeof r.keyId !== "string" || !/^[a-z][a-z0-9_-]{2,31}$/u.test(r.keyId)) invalid();
  if (typeof r.ciphertext !== "string" || !/^(?:[a-f0-9]{2}){32,65536}$/u.test(r.ciphertext) || typeof r.ciphertextDigest !== "string" || !/^[a-f0-9]{64}$/u.test(r.ciphertextDigest)) invalid();
  if (r.idempotencyKey !== `store-admin-invitation/v1/${invitationId}/${generation}`) invalid();
  const firstAttemptAt = timestamp(r.firstAttemptAt), replayDeadline = timestamp(r.replayDeadline);
  if (Date.parse(replayDeadline) !== Date.parse(firstAttemptAt) + 86_100_000) invalid();
  return Object.freeze({ deliveryId: uuid(r.deliveryId), invitationId, storeId: uuid(r.storeId), generation, sealVersion: r.sealVersion, keyId: r.keyId, ciphertext: r.ciphertext, ciphertextDigest: r.ciphertextDigest, rendererVersion: 1, idempotencyKey: r.idempotencyKey, attemptCount, firstAttemptAt, replayDeadline });
}
function authority(a: InvitationAuthority, now: Date): unknown[] { return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, now]; }
const BLOCKED = Symbol("claim_configuration_blocked");

function executor(dependencies: Dependencies, sqlRole: "celebix_saas_identity" | "celebix_saas_workflow") {
  const pool = dependencies.pool, limits = { ...dependencies.timeouts };
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) invalid();
  if (Object.keys(limits).length !== 4 || !pool || typeof pool.connect !== "function") invalid();
  return async function call<K extends string, T>(name: string, values: unknown[], successes: readonly K[], parse: (v: unknown) => T, allow?: (value: T) => boolean): Promise<InvitationResult<K, T>> {
    let client: PostgresClientLike | undefined, committed = false, began = false, destroyed = false;
    const destroy = () => { if (client && !destroyed) { destroyed = true; try { client.release(true); } catch { /* no raw errors */ } } };
    async function bounded<TValue>(promise: Promise<TValue>, ms: number): Promise<TValue> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("deadline")), Math.max(1, ms)); })]); }
      finally { if (timer) clearTimeout(timer); }
    }
    try {
      const pending = Promise.resolve().then(() => pool.connect());
      try { client = await bounded(pending, limits.poolCheckoutMs); }
      catch { void pending.then(c => { try { c.release(true); } catch { /* late checkout */ } }).catch(() => undefined); return { kind: "unavailable" }; }
      const deadline = Date.now() + Math.min(60_000, limits.statementMs * 3 + limits.idleTransactionMs);
      const query = (sql: string, parameters?: unknown[]) => {
        if (Date.now() >= deadline) return Promise.reject(new Error("deadline"));
        return bounded(client!.query(sql, parameters), Math.min(limits.statementMs, deadline - Date.now()));
      };
      await query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await query("SELECT pg_catalog.set_config('statement_timeout',$1,true), pg_catalog.set_config('lock_timeout',$2,true), pg_catalog.set_config('idle_in_transaction_session_timeout',$3,true)", [`${limits.statementMs}ms`, `${limits.lockMs}ms`, `${limits.idleTransactionMs}ms`]);
      await query(`SET LOCAL ROLE ${sqlRole}`);
      const result = await query(`SELECT outcome, result_payload FROM saas.store_admin_invitation_${name}(${values.map((_, i) => `$${i + 1}`).join(",")})`, values);
      if (result.rowCount !== 1 || result.rows.length !== 1) invalid();
      const row = exact(result.rows[0], ["outcome", "result_payload"]);
      let output: InvitationResult<K, T>;
      if (successes.includes(row.outcome as K)) {
        const value = parse(row.result_payload);
        if (allow && allow(value) !== true) throw BLOCKED;
        output = Object.freeze({ kind: row.outcome as K, value });
      } else {
        if (!FAILURES.includes(row.outcome as never) || row.result_payload !== null) invalid();
        output = Object.freeze({ kind: row.outcome as InvitationFailure });
      }
      committed = true; await query("COMMIT");
      try { client.release(); } catch { destroy(); }
      return output;
    } catch (error) {
      if (began && !committed && client) {
        try { await bounded(client.query("ROLLBACK"), limits.statementMs); } catch { /* discard */ }
      }
      destroy();
      return Object.freeze({ kind: committed ? "commit_unknown" : error === BLOCKED ? "configuration_blocked" : "unavailable" });
    }
  };
}

export function createInvitationIdentityRepository(d: Dependencies): InvitationIdentityRepository {
  const call = executor(d, "celebix_saas_identity");
  return Object.freeze({
    list: (a, now) => call("list", authority(a, now), ["listed"], v => { const r = exact(v, ["items", "hasMore"]); if (!Array.isArray(r.items) || r.items.length > 200 || typeof r.hasMore !== "boolean") invalid(); return Object.freeze({ items: Object.freeze(r.items.map(parseStoreAdminInvitationView)), hasMore: r.hasMore }); }),
    source: (a, i) => call("source", [...authority(a, i.now), i.sourceRecordId, i.expectedRecordVersion], ["source"], v => source(v)),
    resendSource: (a, i) => call("resend_source", [...authority(a, i.now), i.invitationId, i.expectedVersion], ["source"], v => source(v, true) as InvitationResendSource),
    issue: (a, i) => call("issue", [...authority(a, i.now), i.operationId, i.fingerprint, i.sourceRecordId, i.expectedRecordVersion, i.candidate], ["issued", "operation_replayed"], parseStoreAdminInvitationView),
    resend: (a, i) => call("resend", [...authority(a, i.now), i.operationId, i.fingerprint, i.invitationId, i.expectedVersion, i.candidate], ["resent", "operation_replayed"], parseStoreAdminInvitationView),
    revoke: (a, i) => call("revoke", [...authority(a, i.now), i.operationId, i.fingerprint, i.invitationId, i.expectedVersion], ["revoked", "operation_replayed"], parseStoreAdminInvitationView),
    recoverOperation: (a, i) => call("recover_operation", [...authority(a, i.now), i.operationId, i.fingerprint], ["operation_replayed"], parseStoreAdminInvitationView),
    resolve: (digest, now) => call("resolve", [digest, now], ["resolved"], v => { const r = exact(v, ["invitationId", "generation", "storeId", "email", "displayName", "role", "expiresAt"]); return Object.freeze({ invitationId: uuid(r.invitationId), generation: positive(r.generation), storeId: uuid(r.storeId), email: email(r.email), displayName: str(r.displayName), role: role(r.role), expiresAt: timestamp(r.expiresAt) }); }),
    grant: i => call("grant", [i.invitationId, i.generation, i.tokenDigest, i.browserKeyId, i.browserDigest, i.issuer, i.subject, i.email, i.emailVerified, i.grantId, i.grantDigest, i.operationId, i.fingerprint, i.now, i.expiresAt], ["granted", "operation_replayed"], grant),
    grantPreview: i => call("grant_preview", [i.grantDigest, i.browserKeyId, i.browserDigest, i.now], ["grant_available"], v => { const r = exact(v, ["grantId", "invitationId", "generation", "storeId", "storeName", "email", "displayName", "role", "expiresAt", "issuer", "subject", "accepted"]); if (typeof r.accepted !== "boolean") invalid(); return Object.freeze({ grantId: uuid(r.grantId), invitationId: uuid(r.invitationId), generation: positive(r.generation), storeId: uuid(r.storeId), storeName: str(r.storeName), email: email(r.email), displayName: str(r.displayName), role: role(r.role), expiresAt: timestamp(r.expiresAt), issuer: str(r.issuer, 2048), subject: str(r.subject, 512), accepted: r.accepted }); }),
    accept: i => call("accept", [i.grantDigest, i.browserKeyId, i.browserDigest, i.operationId, i.fingerprint, i.principalId, i.membershipId, i.now], ["accepted", "operation_replayed"], acceptance),
    recoverAcceptance: i => call("recover_acceptance", [i.grantDigest, i.browserKeyId, i.browserDigest, i.operationId, i.fingerprint, i.now], ["operation_replayed"], acceptance),
  } satisfies InvitationIdentityRepository);
}
export function createInvitationWorkflowRepository(d: Dependencies & { scope: { allowedStoreId: string; allowedRecipient: string } }): InvitationWorkflowRepository {
  const call = executor(d, "celebix_saas_workflow");
  // Trusted runtime configuration only; claim callers cannot select another scope.
  const allowedStoreId = uuid(d.scope.allowedStoreId), allowedRecipient = email(d.scope.allowedRecipient);
  return Object.freeze({
    claim: (i, allow) => call("delivery_claim", [i.workerId, i.leaseId, i.now, i.leaseExpiresAt, i.limit, allowedStoreId, allowedRecipient], ["claimed"], v => { const r = exact(v, ["items"]); if (!Array.isArray(r.items) || r.items.length > i.limit || r.items.length > 20) invalid(); return Object.freeze({ items: Object.freeze(r.items.map(job)) }); }, v => v.items.every(allow)),
    authorize: i => call("delivery_authorize", [i.deliveryId, i.leaseId, i.workerId, i.now], ["authorized"], v => { const r = exact(v, ["deliveryId", "invitationId", "storeId", "generation", "attemptCount", "leaseExpiresAt"]); if (r.deliveryId !== i.deliveryId) invalid(); return Object.freeze({ deliveryId: uuid(r.deliveryId), invitationId: uuid(r.invitationId), storeId: uuid(r.storeId), generation: positive(r.generation), attemptCount: positive(r.attemptCount), leaseExpiresAt: timestamp(r.leaseExpiresAt) }); }),
    settle: i => call("delivery_settle", [i.deliveryId, i.leaseId, i.workerId, i.now, i.resultKind, i.providerMessageId, i.safeErrorCode, i.nextAttemptAt], ["settled", "operation_replayed"], v => { const r = exact(v, ["deliveryId", "deliveryStatus"]); if (r.deliveryId !== i.deliveryId || !STORE_ADMIN_INVITATION_DELIVERY_STATUSES.includes(r.deliveryStatus as never)) invalid(); return Object.freeze({ deliveryId: uuid(r.deliveryId), deliveryStatus: r.deliveryStatus as StoreAdminInvitationDeliveryStatus }); }),
  } satisfies InvitationWorkflowRepository);
}
