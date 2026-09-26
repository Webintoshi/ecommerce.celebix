import { createHash } from "node:crypto";
import { parseToshiConversation, parseToshiConversationListResponse, parseToshiMessage, type ToshiConversation, type ToshiConversationSummary } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { exactToshiInput, toshiAuthority, toshiUuid } from "../toshi-providers/canonical.ts";
import { ToshiProviderRepositoryError } from "../toshi-providers/errors.ts";
import { TOSHI_CONVERSATION_ERROR_CODES, ToshiConversationRepositoryError, type ToshiConversationErrorCode } from "./errors.ts";
import type { BeginToshiTurnInput, BeginToshiTurnResult, CompleteToshiTurnInput, FailToshiTurnInput, GetToshiConversationInput, PostgresToshiConversationRepositoryOptions, ToshiConversationAuthorityInput, ToshiConversationRepository } from "./types.ts";

type Authority = ReturnType<typeof toshiAuthority>;
type Spec = Readonly<{ text: string; values: unknown[] }>;
type Outcome = Readonly<{ outcome: string; payload: unknown }>;
const CODES = new Set<string>(TOSHI_CONVERSATION_ERROR_CODES);
const UUID = "11111111-1111-4111-8111-111111111111", TIME = "2026-01-01T00:00:00.000Z";
function fail(code: ToshiConversationErrorCode = "unavailable"): never { throw new ToshiConversationRepositoryError(code); }
function input<T>(fn: () => T): T {
  try { return fn(); } catch (e) {
    if (e instanceof ToshiConversationRepositoryError) throw e;
    if (e instanceof ToshiProviderRepositoryError && CODES.has(e.code)) fail(e.code as ToshiConversationErrorCode);
    fail("invalid_input");
  }
}
function timeout(n: number): string { if (!Number.isSafeInteger(n) || n < 1 || n > 60_000) fail(); return `${n}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> { try { return exactToshiInput(value, keys); } catch { fail(); } }
function outcome(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Outcome {
  if (value.rowCount !== 1 || value.rows.length !== 1) fail();
  const selected = exact(value.rows[0], ["outcome", "result_payload"]);
  if (typeof selected.outcome !== "string") fail();
  return { outcome: selected.outcome, payload: selected.result_payload };
}
function authorityValues(a: Authority): unknown[] { return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now]; }
function publicConversation(value: unknown): ToshiConversation { try { return parseToshiConversation(value); } catch { fail(); } }
function ready(value: unknown, operationId: string): BeginToshiTurnResult {
  const p = exact(value, ["operationId", "conversation", "configId", "credentialVersion"]);
  try {
    if (p.operationId !== operationId || !Number.isSafeInteger(p.credentialVersion) || (p.credentialVersion as number) < 1) fail();
    return Object.freeze({ kind: "ready" as const, operationId, conversation: publicConversation(p.conversation), configId: toshiUuid(p.configId), credentialVersion: p.credentialVersion as number });
  } catch { fail(); }
}
function parseBegin(result: Outcome, operationId: string): BeginToshiTurnResult {
  if (CODES.has(result.outcome)) fail(result.outcome as ToshiConversationErrorCode);
  if (result.outcome === "ready") return ready(result.payload, operationId);
  if (result.outcome === "replayed") return Object.freeze({ kind: "replayed", conversation: publicConversation(result.payload) });
  fail();
}
function parseCompleted(result: Outcome): ToshiConversation {
  if (CODES.has(result.outcome)) fail(result.outcome as ToshiConversationErrorCode);
  if (result.outcome !== "completed") fail();
  return publicConversation(result.payload);
}
function parseFailed(result: Outcome): Readonly<{ code: ToshiConversationErrorCode }> {
  if (CODES.has(result.outcome)) fail(result.outcome as ToshiConversationErrorCode);
  if (result.outcome !== "failed") fail();
  const p = exact(result.payload, ["code"]);
  if (typeof p.code !== "string" || !CODES.has(p.code)) fail();
  return Object.freeze({ code: p.code as ToshiConversationErrorCode });
}

export class PostgresToshiConversationRepository implements ToshiConversationRepository {
  private readonly options: PostgresToshiConversationRepositoryOptions;
  constructor(options: PostgresToshiConversationRepositoryOptions) {
    if (!options || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" || options.role !== "celebix_saas_app" || typeof options.audit !== "function" || typeof options.pool?.connect !== "function" || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") fail();
    for (const n of Object.values(options.timeouts)) timeout(n);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }
  private async rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
  private async transaction<T>(spec: Spec, parse: (selected: Outcome) => T, recovery?: () => Promise<T>): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { fail(); }
    let began = false, terminal = false;
    try {
      await client.query(recovery ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN READ ONLY"); began = true;
      await this.configure(client);
      const selected = parse(outcome(await client.query(spec.text, spec.values)));
      try { await client.query("COMMIT"); terminal = true; release(client); return selected; }
      catch {
        terminal = true; release(client, true);
        if (!recovery) fail();
        try { const pending = this.options.audit({ type: "toshi_conversation_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {}
        const recovered = await recovery();
        if (JSON.stringify(recovered) !== JSON.stringify(selected)) fail();
        return recovered;
      }
    } catch (e) {
      if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true);
      if (e instanceof ToshiConversationRepositoryError) throw e;
      fail();
    }
  }
  private recover<T>(a: Authority, operationId: string, phase: string, fingerprint: string | null, parse: (selected: Outcome) => T): Promise<T> {
    return this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_recover_turn($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text)", values: [...authorityValues(a), operationId, phase, fingerprint] }, parse);
  }
  async list(value: ToshiConversationAuthorityInput): Promise<readonly ToshiConversationSummary[]> {
    const a = input(() => { const p = exactToshiInput(value, ["tenantContext", "now"]); return toshiAuthority(p.tenantContext as never, p.now as Date); });
    return this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)", values: authorityValues(a) }, (r) => {
      if (CODES.has(r.outcome)) fail(r.outcome as ToshiConversationErrorCode);
      if (r.outcome !== "listed") fail();
      const p = exact(r.payload, ["conversations"]);
      try { return parseToshiConversationListResponse({ conversations: p.conversations, defaultProvider: null }).conversations; } catch { fail(); }
    });
  }
  async get(value: GetToshiConversationInput): Promise<ToshiConversation> {
    const { a, id } = input(() => { const p = exactToshiInput(value, ["tenantContext", "now", "conversationId"]); return { a: toshiAuthority(p.tenantContext as never, p.now as Date), id: toshiUuid(p.conversationId) }; });
    return this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)", values: [...authorityValues(a), id] }, (r) => {
      if (CODES.has(r.outcome)) fail(r.outcome as ToshiConversationErrorCode);
      if (r.outcome !== "found") fail(); return publicConversation(r.payload);
    });
  }
  async beginTurn(value: BeginToshiTurnInput): Promise<BeginToshiTurnResult> {
    const { a, operationId, conversationId, expectedVersion, text } = input(() => {
      const p = exactToshiInput(value, ["tenantContext", "now", "operationId", "conversationId", "expectedVersion", "text"]);
      const conversationId = p.conversationId === null ? null : toshiUuid(p.conversationId);
      if (conversationId === null ? p.expectedVersion !== null : !Number.isSafeInteger(p.expectedVersion) || (p.expectedVersion as number) < 0 || (p.expectedVersion as number) > 100) fail("invalid_input");
      const parsed = parseToshiMessage({ id: UUID, role: "user", text: p.text, sources: [], createdAt: TIME });
      return { a: toshiAuthority(p.tenantContext as never, p.now as Date), operationId: toshiUuid(p.operationId), conversationId, expectedVersion: p.expectedVersion as number | null, text: parsed.text };
    });
    const fingerprint = createHash("sha256").update(JSON.stringify([a.storeId, a.principalId, conversationId, expectedVersion, text])).digest("hex");
    const parse = (r: Outcome) => parseBegin(r, operationId);
    return this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_begin_turn($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)", values: [...authorityValues(a), operationId, fingerprint, conversationId, expectedVersion, text] }, parse, () => this.recover(a, operationId, "begin", fingerprint, parse));
  }
  async completeTurn(value: CompleteToshiTurnInput): Promise<ToshiConversation> {
    const { a, operationId, message } = input(() => {
      const p = exactToshiInput(value, ["tenantContext", "now", "operationId", "assistantText", "sources"]);
      return { a: toshiAuthority(p.tenantContext as never, p.now as Date), operationId: toshiUuid(p.operationId), message: parseToshiMessage({ id: UUID, role: "assistant", text: p.assistantText, sources: p.sources, createdAt: TIME }) };
    });
    return this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_complete_turn($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::jsonb)", values: [...authorityValues(a), operationId, message.text, JSON.stringify(message.sources)] }, parseCompleted, () => this.recover(a, operationId, "complete", null, parseCompleted));
  }
  async failTurn(value: FailToshiTurnInput): Promise<void> {
    const { a, operationId, code } = input(() => {
      const p = exactToshiInput(value, ["tenantContext", "now", "operationId", "code"]);
      if (typeof p.code !== "string" || !CODES.has(p.code)) fail("invalid_input");
      return { a: toshiAuthority(p.tenantContext as never, p.now as Date), operationId: toshiUuid(p.operationId), code: p.code };
    });
    await this.transaction({ text: "SELECT outcome,result_payload FROM saas.toshi_conversation_fail_turn($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)", values: [...authorityValues(a), operationId, code] }, parseFailed, () => this.recover(a, operationId, "fail", null, parseFailed));
  }
}
