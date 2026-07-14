import { createHash } from "node:crypto";

import type { OpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";
import type { PanelBrowserBindingAuthorityCodec } from "./credential-codec.ts";

const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_TIMEOUT_MS = 60_000;

interface QueryResult { rows: Record<string, unknown>[]; rowCount: number | null }
interface PostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
  release(destroy?: boolean | Error): void;
}
interface PostgresPool { connect(): Promise<PostgresClient> }

type RepositoryKind =
  | "browser_bootstrap_created" | "browser_bootstrap_replayed"
  | "browser_binding_created" | "browser_binding_replayed"
  | "browser_callback_claimed" | "callback_replayed"
  | "operation_mismatch" | "expired" | "unauthenticated"
  | "durable_authority_invalid" | "commit_unknown" | "unavailable" | "cleaned";

export type PanelBrowserBootstrapResult = Readonly<
  | { kind: "browser_bootstrap_created" | "browser_bootstrap_replayed"; expiresAt: string }
  | { kind: "operation_mismatch" | "expired" | "durable_authority_invalid" | "commit_unknown" | "unavailable" }
>;

export type PanelBrowserBindingResult = Readonly<
  | {
      kind: "browser_binding_created" | "browser_binding_replayed";
      providerAuthorizationUrl: string;
      expiresAt: string;
    }
  | { kind: "operation_mismatch" | "expired" | "unauthenticated" | "durable_authority_invalid" | "commit_unknown" | "unavailable" }
>;

export type PanelBrowserCallbackClaimResult = Readonly<{
  kind: "browser_callback_claimed" | "callback_replayed" | "operation_mismatch" | "expired" |
    "unauthenticated" | "durable_authority_invalid" | "commit_unknown" | "unavailable";
}>;

export interface PostgresPanelBrowserBindingRepository {
  createBootstrap(input: {
    rawState: string;
    bootstrapCredential: string;
    providerAuthorizationUrl: string;
    bindingId: string;
    issuedAt: Date;
    expiresAt: Date;
  }): Promise<PanelBrowserBootstrapResult>;
  bindBrowserCredential(input: {
    bootstrapCredential: string;
    providerAuthorizationUrl: string;
    browserBindingCredential: string;
    now: Date;
    expiresAt: Date;
  }): Promise<PanelBrowserBindingResult>;
  claimCallback(input: {
    rawState: string;
    browserBindingCredential: string;
    now: Date;
  }): Promise<PanelBrowserCallbackClaimResult>;
  cleanupExpired(input: { now: Date; limit: number }): Promise<Readonly<{ kind: "cleaned"; count: number } | { kind: "commit_unknown" | "unavailable" }>>;
}

type Audit = (event: Readonly<{ operation: "create" | "bind" | "claim" | "cleanup"; result: RepositoryKind }>) => void | Promise<void>;

interface Dependencies {
  pool: PostgresPool;
  stateDigester: OpaqueStateDigester;
  oidcStateDigester: OpaqueStateDigester;
  credentialCodec: PanelBrowserBindingAuthorityCodec;
  clock(): Date;
  timeouts: { poolCheckoutMs: number; statementMs: number; lockMs: number; idleTransactionMs: number };
  audit: Audit;
}

function invalid(): never { throw new Error("panel_browser_binding_repository_invalid"); }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return row;
}

function canonicalString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value) invalid();
  return value;
}

function canonicalDigest(value: unknown): string {
  const parsed = canonicalString(value, 64);
  if (!DIGEST.test(parsed)) invalid();
  return parsed;
}

function canonicalTimestamp(value: unknown): string {
  const parsed = value instanceof Date ? value.toISOString() : canonicalString(value, 32);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) invalid();
  return parsed;
}

function canonicalDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function canonicalUuid(value: unknown): string {
  const parsed = canonicalString(value, 36);
  if (!UUID.test(parsed)) invalid();
  return parsed;
}

function boundedTimeout(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > MAXIMUM_TIMEOUT_MS) invalid();
  return Number(value);
}

function copyDependencies(input: Dependencies) {
  if (!input?.pool || typeof input.pool.connect !== "function" || !input.stateDigester ||
      typeof input.stateDigester.digest !== "function" || !input.oidcStateDigester ||
      typeof input.oidcStateDigester.digest !== "function" || !input.credentialCodec ||
      typeof input.credentialCodec.generateBootstrapCredential !== "function" ||
      typeof input.credentialCodec.digestBootstrapCredential !== "function" ||
      typeof input.credentialCodec.digestBrowserBindingCredential !== "function" ||
      typeof input.credentialCodec.digestBrowserBindingCredentialCandidates !== "function" ||
      typeof input.clock !== "function" || typeof input.audit !== "function") invalid();
  const current = input.clock();
  canonicalDate(current);
  return Object.freeze({
    pool: Object.freeze({ connect: input.pool.connect.bind(input.pool) }),
    stateDigester: Object.freeze({ digest: input.stateDigester.digest.bind(input.stateDigester) }),
    oidcStateDigester: Object.freeze({ digest: input.oidcStateDigester.digest.bind(input.oidcStateDigester) }),
    credentialCodec: Object.freeze({
      generateBootstrapCredential: input.credentialCodec.generateBootstrapCredential.bind(input.credentialCodec),
      digestBootstrapCredential: input.credentialCodec.digestBootstrapCredential.bind(input.credentialCodec),
      digestBrowserBindingCredential: input.credentialCodec.digestBrowserBindingCredential.bind(input.credentialCodec),
      digestBrowserBindingCredentialCandidates: input.credentialCodec.digestBrowserBindingCredentialCandidates.bind(input.credentialCodec),
    }),
    clock: input.clock,
    audit: input.audit,
    timeouts: Object.freeze({
      poolCheckoutMs: boundedTimeout(input.timeouts?.poolCheckoutMs),
      statementMs: boundedTimeout(input.timeouts?.statementMs),
      lockMs: boundedTimeout(input.timeouts?.lockMs),
      idleTransactionMs: boundedTimeout(input.timeouts?.idleTransactionMs),
    }),
  });
}

async function acquire(dependencies: ReturnType<typeof copyDependencies>): Promise<PostgresClient> {
  const pending = Promise.resolve().then(() => dependencies.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, dependencies.timeouts.poolCheckoutMs);
  });
  try { return await Promise.race([pending, deadline]); }
  catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally { if (timer) clearTimeout(timer); }
}

type TransactionResult<T> = { status: "ok"; value: T } | { status: "commit_unknown" | "unavailable" };

async function transaction<T>(
  dependencies: ReturnType<typeof copyDependencies>,
  work: (client: PostgresClient) => Promise<T>,
): Promise<TransactionResult<T>> {
  let client: PostgresClient;
  try { client = await acquire(dependencies); } catch { return { status: "unavailable" }; }
  let began = false;
  let commitForwarded = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${dependencies.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${dependencies.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${dependencies.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const value = await work(client);
    commitForwarded = true;
    await client.query("COMMIT");
    try { client.release(); } catch { try { client.release(true); } catch { /* best effort */ } }
    return { status: "ok", value };
  } catch {
    if (commitForwarded) {
      try { client.release(true); } catch { /* best effort */ }
      return { status: "commit_unknown" };
    }
    if (began) try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
    try { client.release(true); } catch { /* best effort */ }
    return { status: "unavailable" };
  }
}

function oneRow(result: QueryResult): { outcome: string; authority: unknown } {
  if (result.rowCount !== 1 || result.rows.length !== 1) invalid();
  const row = exact(result.rows[0], ["outcome", "authority"]);
  return { outcome: canonicalString(row.outcome, 64), authority: row.authority };
}

function auditSafely(dependencies: ReturnType<typeof copyDependencies>, operation: "create" | "bind" | "claim" | "cleanup", result: RepositoryKind): void {
  try { void Promise.resolve(dependencies.audit(Object.freeze({ operation, result }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function finish<T extends { kind: RepositoryKind }>(dependencies: ReturnType<typeof copyDependencies>, operation: "create" | "bind" | "claim" | "cleanup", result: T): Readonly<T> {
  auditSafely(dependencies, operation, result.kind);
  return Object.freeze({ ...result });
}

function exactProviderUrl(value: unknown): string {
  return canonicalString(value, 16_384);
}

function sha256Exact(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPostgresPanelBrowserBindingRepository(raw: Dependencies): PostgresPanelBrowserBindingRepository {
  const dependencies = copyDependencies(raw);

  const repository: PostgresPanelBrowserBindingRepository = {
    async createBootstrap(input) {
      let stateDigest: string;
      let oidcStateDigest: string;
      let proof;
      let urlDigest: string;
      let bindingId: string;
      let issuedAt: Date;
      let expiresAt: Date;
      try {
        const state = canonicalString(input?.rawState, 1_024);
        stateDigest = canonicalDigest(dependencies.stateDigester.digest(state));
        oidcStateDigest = canonicalDigest(dependencies.oidcStateDigester.digest(state));
        proof = dependencies.credentialCodec.digestBootstrapCredential(input.bootstrapCredential);
        urlDigest = sha256Exact(exactProviderUrl(input.providerAuthorizationUrl));
        bindingId = canonicalUuid(input.bindingId);
        issuedAt = canonicalDate(input.issuedAt);
        expiresAt = canonicalDate(input.expiresAt);
      } catch { return finish(dependencies, "create", { kind: "durable_authority_invalid" }); }
      const executed = await transaction(dependencies, async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.create_panel_browser_bootstrap($1,$2,$3,$4,$5,$6,$7,$8)",
        [stateDigest, oidcStateDigest, proof.keyId, proof.digest, urlDigest, bindingId, issuedAt, expiresAt],
      )));
      if (executed.status !== "ok") return finish(dependencies, "create", { kind: executed.status });
      const allowed = ["browser_bootstrap_created", "browser_bootstrap_replayed", "operation_mismatch", "expired", "durable_authority_invalid"];
      if (!allowed.includes(executed.value.outcome)) return finish(dependencies, "create", { kind: "durable_authority_invalid" });
      if (executed.value.outcome !== "browser_bootstrap_created" && executed.value.outcome !== "browser_bootstrap_replayed") {
        return finish(dependencies, "create", { kind: executed.value.outcome as "operation_mismatch" | "expired" | "durable_authority_invalid" });
      }
      try {
        const authority = exact(executed.value.authority, [
          "bindingId", "attemptId", "stateDigest", "oidcStateDigest", "bootstrapTokenKeyId", "bootstrapTokenDigest",
          "authorizationUrlDigest", "issuedAt", "bootstrapExpiresAt", "version",
        ]);
        if (authority.bindingId !== bindingId || authority.stateDigest !== stateDigest ||
            authority.oidcStateDigest !== oidcStateDigest ||
            authority.bootstrapTokenKeyId !== proof.keyId || authority.bootstrapTokenDigest !== proof.digest ||
            authority.authorizationUrlDigest !== urlDigest || authority.issuedAt !== issuedAt.toISOString() ||
            authority.version !== 1) invalid();
        const persistedExpiry = canonicalTimestamp(authority.bootstrapExpiresAt);
        if (persistedExpiry !== expiresAt.toISOString()) invalid();
        canonicalString(authority.attemptId, 136);
        return finish(dependencies, "create", { kind: executed.value.outcome, expiresAt: persistedExpiry });
      } catch { return finish(dependencies, "create", { kind: "durable_authority_invalid" }); }
    },

    async bindBrowserCredential(input) {
      let bootstrapProof;
      let bindingProof;
      let providerAuthorizationUrl: string;
      let urlDigest: string;
      let at: Date;
      let expiresAt: Date;
      try {
        bootstrapProof = dependencies.credentialCodec.digestBootstrapCredential(input?.bootstrapCredential);
        bindingProof = dependencies.credentialCodec.digestBrowserBindingCredential(input.browserBindingCredential);
        providerAuthorizationUrl = exactProviderUrl(input.providerAuthorizationUrl);
        urlDigest = sha256Exact(providerAuthorizationUrl);
        at = canonicalDate(input.now);
        expiresAt = canonicalDate(input.expiresAt);
      } catch { return finish(dependencies, "bind", { kind: "durable_authority_invalid" }); }
      const executed = await transaction(dependencies, async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.bind_panel_browser_credential($1,$2,$3,$4,$5,$6,$7)",
        [bootstrapProof.keyId, bootstrapProof.digest, urlDigest, bindingProof.keyId, bindingProof.digest, at, expiresAt],
      )));
      if (executed.status !== "ok") return finish(dependencies, "bind", { kind: executed.status });
      const allowed = ["browser_binding_created", "browser_binding_replayed", "operation_mismatch", "expired", "unauthenticated", "durable_authority_invalid"];
      if (!allowed.includes(executed.value.outcome)) return finish(dependencies, "bind", { kind: "durable_authority_invalid" });
      if (executed.value.outcome !== "browser_binding_created" && executed.value.outcome !== "browser_binding_replayed") {
        return finish(dependencies, "bind", { kind: executed.value.outcome as "operation_mismatch" | "expired" | "unauthenticated" | "durable_authority_invalid" });
      }
      try {
        const authority = exact(executed.value.authority, [
          "authorizationUrlDigest", "browserBindingKeyId", "browserBindingDigest", "browserBindingExpiresAt", "version",
        ]);
        if (authority.authorizationUrlDigest !== urlDigest || authority.browserBindingKeyId !== bindingProof.keyId ||
            authority.browserBindingDigest !== bindingProof.digest || authority.version !== 2) invalid();
        const persistedExpiry = canonicalTimestamp(authority.browserBindingExpiresAt);
        const persistedExpiryMs = Date.parse(persistedExpiry);
        if (persistedExpiryMs <= at.getTime() || persistedExpiryMs > expiresAt.getTime() ||
            persistedExpiryMs > at.getTime() + 15 * 60_000) invalid();
        return finish(dependencies, "bind", {
          kind: executed.value.outcome,
          providerAuthorizationUrl,
          expiresAt: persistedExpiry,
        });
      } catch { return finish(dependencies, "bind", { kind: "durable_authority_invalid" }); }
    },

    async claimCallback(input) {
      let stateDigest: string;
      let oidcStateDigest: string;
      let keyIds: string[];
      let digests: string[];
      let at: Date;
      try {
        const state = canonicalString(input?.rawState, 1_024);
        stateDigest = canonicalDigest(dependencies.stateDigester.digest(state));
        oidcStateDigest = canonicalDigest(dependencies.oidcStateDigester.digest(state));
        const candidates = dependencies.credentialCodec.digestBrowserBindingCredentialCandidates(input.browserBindingCredential);
        if (candidates.length < 1 || candidates.length > 16) invalid();
        keyIds = candidates.map((candidate) => canonicalString(candidate.keyId, 64));
        digests = candidates.map((candidate) => canonicalDigest(candidate.digest));
        if (new Set(keyIds).size !== keyIds.length) invalid();
        at = canonicalDate(input.now);
      } catch { return finish(dependencies, "claim", { kind: "durable_authority_invalid" }); }
      const executed = await transaction(dependencies, async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.claim_panel_browser_callback($1,$2,$3::text[],$4::text[],$5)",
        [stateDigest, oidcStateDigest, keyIds, digests, at],
      )));
      if (executed.status !== "ok") return finish(dependencies, "claim", { kind: executed.status });
      const allowed = ["browser_callback_claimed", "callback_replayed", "operation_mismatch", "expired", "unauthenticated", "durable_authority_invalid"];
      if (!allowed.includes(executed.value.outcome)) return finish(dependencies, "claim", { kind: "durable_authority_invalid" });
      if (executed.value.outcome === "browser_callback_claimed") {
        try {
          const authority = exact(executed.value.authority, ["callbackClaimedAt", "version"]);
          if (authority.version !== 3 || canonicalTimestamp(authority.callbackClaimedAt) !== at.toISOString()) invalid();
        } catch { return finish(dependencies, "claim", { kind: "durable_authority_invalid" }); }
      } else if (executed.value.authority !== null && executed.value.authority !== undefined) {
        return finish(dependencies, "claim", { kind: "durable_authority_invalid" });
      }
      return finish(dependencies, "claim", { kind: executed.value.outcome as PanelBrowserCallbackClaimResult["kind"] });
    },

    async cleanupExpired(input) {
      let at: Date;
      let limit: number;
      try {
        at = canonicalDate(input?.now);
        limit = input.limit;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) invalid();
      } catch { return finish(dependencies, "cleanup", { kind: "unavailable" }); }
      const executed = await transaction(dependencies, async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.cleanup_panel_browser_bindings($1,$2)", [at, limit],
      )));
      if (executed.status !== "ok") return finish(dependencies, "cleanup", { kind: executed.status });
      try {
        if (executed.value.outcome !== "cleaned") invalid();
        const authority = exact(executed.value.authority, ["count"]);
        if (!Number.isSafeInteger(authority.count) || Number(authority.count) < 0 || Number(authority.count) > limit) invalid();
        auditSafely(dependencies, "cleanup", "cleaned");
        return Object.freeze({ kind: "cleaned" as const, count: Number(authority.count) });
      } catch { return finish(dependencies, "cleanup", { kind: "unavailable" }); }
    },
  };
  return Object.freeze(repository);
}
