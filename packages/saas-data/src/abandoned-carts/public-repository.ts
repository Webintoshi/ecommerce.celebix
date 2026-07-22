import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  PUBLIC_ABANDONED_CART_ERROR_CODES,
  PublicAbandonedCartRepositoryError,
  type PublicAbandonedCartErrorCode,
} from "./public-errors.ts";
import type {
  CapturePublicAbandonedCartInput,
  ConvertPublicAbandonedCartInput,
  MarkStaleAbandonedCartsInput,
  MarkStaleAbandonedCartsResult,
  PublicAbandonedCartRepository,
  PublicAbandonedCartRepositoryOptions,
  PublicAbandonedCartResult,
} from "./public-types.ts";
import { captureInput, convertInput, staleInput } from "./public-validation.ts";

type Query = Readonly<{ text: string; values: unknown[] }>;
const ERROR_CODES = new Set<string>(PUBLIC_ABANDONED_CART_ERROR_CODES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function unavailable(): PublicAbandonedCartRepositoryError { return new PublicAbandonedCartRepositoryError("unavailable"); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable(); return `${value}ms`; }
function safeRelease(client: PostgresClientLike, destroy?: boolean) { try { client.release(destroy); } catch { /* best effort */ } }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return parsed;
}

function selected(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>) {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw unavailable();
  const parsed = exact(result.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable();
  return { outcome: parsed.outcome, payload: parsed.result_payload };
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO.test(value) || new Date(value).toISOString() !== value) throw unavailable();
  return value;
}

function cartProjection(value: unknown): PublicAbandonedCartResult {
  const parsed = exact(value, ["id", "status", "currency", "totalCents", "itemCount", "version", "updatedAt"]);
  if (typeof parsed.id !== "string" || !UUID.test(parsed.id) || !["active", "recovered", "archived"].includes(String(parsed.status)) || typeof parsed.currency !== "string" || !/^[A-Z]{3}$/.test(parsed.currency) || !Number.isSafeInteger(parsed.totalCents) || (parsed.totalCents as number) < 0 || !Number.isSafeInteger(parsed.itemCount) || (parsed.itemCount as number) < 0 || (parsed.itemCount as number) > 100 || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) throw unavailable();
  return Object.freeze({ id: parsed.id, status: parsed.status, currency: parsed.currency, totalCents: parsed.totalCents, itemCount: parsed.itemCount, version: parsed.version, updatedAt: timestamp(parsed.updatedAt) }) as PublicAbandonedCartResult;
}

function staleProjection(value: unknown): MarkStaleAbandonedCartsResult {
  const parsed = exact(value, ["affected", "asOf"]);
  if (!Number.isSafeInteger(parsed.affected) || (parsed.affected as number) < 0) throw unavailable();
  return Object.freeze({ affected: parsed.affected as number, asOf: timestamp(parsed.asOf) });
}

export class PostgresPublicAbandonedCartRepository implements PublicAbandonedCartRepository {
  private readonly options: PublicAbandonedCartRepositoryOptions;
  constructor(options: PublicAbandonedCartRepositoryOptions) {
    if (typeof options !== "object" || options === null || Array.isArray(options) || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" || options.role !== "celebix_saas_workflow" || typeof options.audit !== "function" || typeof options.timeouts !== "object" || options.timeouts === null || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable();
    timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }

  private async configure(client: PostgresClientLike) {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
  }

  private async execute<T>(spec: Query, parser: (value: unknown) => T, success: readonly string[]): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw unavailable(); }
    let began = false; let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
      const result = selected(await client.query(spec.text, spec.values));
      if (!success.includes(result.outcome)) {
        if (ERROR_CODES.has(result.outcome) && result.outcome !== "unavailable" && result.outcome !== "commit_unknown") throw new PublicAbandonedCartRepositoryError(result.outcome as PublicAbandonedCartErrorCode);
        throw unavailable();
      }
      const parsed = parser(result.payload);
      try { await client.query("COMMIT"); terminal = true; safeRelease(client); return parsed; }
      catch {
        terminal = true; safeRelease(client, true);
        try { const pending = this.options.audit({ type: "abandoned_cart_capture_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch { /* observational */ }
        throw new PublicAbandonedCartRepositoryError("commit_unknown");
      }
    } catch (error) {
      if (began && !terminal) {
        try { await client.query("ROLLBACK"); safeRelease(client); } catch { safeRelease(client, true); }
      } else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof PublicAbandonedCartRepositoryError) throw error;
      throw unavailable();
    }
  }

  async capture(input: CapturePublicAbandonedCartInput): Promise<PublicAbandonedCartResult> {
    const parsed = captureInput(input);
    return this.execute({
      text: `SELECT outcome, result_payload FROM saas.abandoned_carts_capture(
        $1::text,$2::uuid,$3::text,$4::timestamptz,$5::jsonb,$6::jsonb
      )`,
      values: [parsed.hostname, parsed.cartId, parsed.credentialDigest, parsed.now, JSON.stringify(parsed.customer), JSON.stringify(parsed.items)],
    }, cartProjection, ["captured", "recovered"]);
  }

  async markStale(input: MarkStaleAbandonedCartsInput): Promise<MarkStaleAbandonedCartsResult> {
    const parsed = staleInput(input);
    return this.execute({ text: "SELECT outcome, result_payload FROM saas.abandoned_carts_mark_stale($1::timestamptz,$2::timestamptz)", values: [parsed.now, parsed.staleBefore] }, staleProjection, ["committed"]);
  }

  async convert(input: ConvertPublicAbandonedCartInput): Promise<PublicAbandonedCartResult> {
    const parsed = convertInput(input);
    return this.execute({ text: "SELECT outcome, result_payload FROM saas.abandoned_carts_convert($1::text,$2::text,$3::uuid,$4::timestamptz)", values: [parsed.hostname, parsed.credentialDigest, parsed.orderId, parsed.now] }, cartProjection, ["committed"]);
  }
}
