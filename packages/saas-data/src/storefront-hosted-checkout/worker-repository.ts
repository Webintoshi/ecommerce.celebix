import { types as nodeTypes } from "node:util";

import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike, type PostgresTimeoutOptions } from "../postgres/pool.ts";
import { StorefrontHostedCheckoutRepositoryError } from "./repository.ts";

export type StorefrontHostedCheckoutReconciliationCandidate = Readonly<{
  attemptId: string;
  attemptVersion: number;
  attemptStatus: "awaiting_customer" | "submitted" | "authorized" | "provider_outcome_unknown" | "reconciliation_required";
  credentialVersion: number;
  providerReference: string | null;
}>;

export type StorefrontHostedCheckoutWorkerRepository = Readonly<{
  expireCreated(input: Readonly<{ now: Date; limit: number }>): Promise<number>;
  reconciliationCandidates(input: Readonly<{ now: Date; limit: number }>): Promise<readonly StorefrontHostedCheckoutReconciliationCandidate[]>;
}>;

export type PostgresStorefrontHostedCheckoutWorkerRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "storefront_hosted_checkout_worker_commit_unknown" }>) => void | Promise<void>;
}>;

type Options = PostgresStorefrontHostedCheckoutWorkerRepositoryOptions;
type Selected = Readonly<{ outcome: string; result: unknown }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STATUS = new Set(["awaiting_customer", "submitted", "authorized", "provider_outcome_unknown", "reconciliation_required"]);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function failure(code: "invalid_input" | "unavailable" | "commit_unknown"): never {
  throw new StorefrontHostedCheckoutRepositoryError(code);
}
function exact(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) failure("unavailable");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) failure("unavailable");
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== keys.length
      || Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))
      || keys.some((key) => !Object.hasOwn(descriptors, key))) failure("unavailable");
    const copied: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor)) failure("unavailable");
      copied[key] = descriptor.value;
    }
    return Object.freeze(copied);
  } catch (error) {
    if (error instanceof StorefrontHostedCheckoutRepositoryError) throw error;
    return failure("unavailable");
  }
}
function selected(value: unknown): Selected {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) failure("unavailable");
  const resultDescriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const rowsDescriptor = resultDescriptors.rows;
  const rowCountDescriptor = resultDescriptors.rowCount;
  if (!rowsDescriptor?.enumerable || !("value" in rowsDescriptor)
    || !rowCountDescriptor?.enumerable || !("value" in rowCountDescriptor)) failure("unavailable");
  const rows = rowsDescriptor.value;
  if (rowCountDescriptor.value !== 1 || !Array.isArray(rows) || nodeTypes.isProxy(rows)
    || Object.getPrototypeOf(rows) !== Array.prototype || rows.length !== 1) failure("unavailable");
  const descriptors = Object.getOwnPropertyDescriptors(rows) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== 2 || !descriptors["0"]?.enumerable || !("value" in descriptors["0"])) failure("unavailable");
  const row = exact(descriptors["0"].value, ["outcome", "result_payload"]);
  if (typeof row.outcome !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(row.outcome)) failure("unavailable");
  return Object.freeze({ outcome: row.outcome, result: row.result_payload });
}
function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) failure("unavailable");
  return `${String(value)}ms`;
}
function validateOptions(value: Options): Options {
  const parsed = exact(value, ["pool", "role", "timeouts", "audit"]);
  const timeouts = exact(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
  if (parsed.role !== "celebix_saas_workflow" || typeof parsed.audit !== "function"
    || typeof parsed.pool !== "object" || parsed.pool === null
    || typeof (parsed.pool as { connect?: unknown }).connect !== "function") failure("unavailable");
  for (const item of Object.values(timeouts)) timeout(item);
  return Object.freeze({
    pool: parsed.pool as PostgresPoolLike,
    role: "celebix_saas_workflow",
    timeouts: Object.freeze({
      poolCheckoutMs: timeouts.poolCheckoutMs as number,
      statementMs: timeouts.statementMs as number,
      lockMs: timeouts.lockMs as number,
      idleTransactionMs: timeouts.idleTransactionMs as number,
    }),
    audit: parsed.audit as Options["audit"],
  });
}
function input(value: unknown): Readonly<{ now: Date; limit: number }> {
  let parsed: Readonly<Record<string, unknown>>;
  try { parsed = exact(value, ["now", "limit"]); } catch { return failure("invalid_input"); }
  if (!(parsed.now instanceof Date) || !Number.isFinite(parsed.now.getTime())
    || !Number.isSafeInteger(parsed.limit) || (parsed.limit as number) < 1 || (parsed.limit as number) > 25) failure("invalid_input");
  return Object.freeze({ now: new Date(parsed.now.getTime()), limit: parsed.limit as number });
}
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch { /* cleanup only */ } }
async function rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }

export class PostgresStorefrontHostedCheckoutWorkerRepository implements StorefrontHostedCheckoutWorkerRepository {
  private readonly options: Options;
  constructor(options: Options) { this.options = validateOptions(options); }
  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { return failure("unavailable"); }
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
  }
  private async execute(text: string, values: unknown[], readOnly: boolean): Promise<Selected> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const result = selected(await client.query(text, values));
      try { await client.query("COMMIT"); terminal = true; release(client); return result; }
      catch {
        terminal = true; release(client, true);
        if (!readOnly) {
          try { void Promise.resolve(this.options.audit(Object.freeze({ type: "storefront_hosted_checkout_worker_commit_unknown" }))).catch(() => undefined); } catch { /* observational */ }
          return failure("commit_unknown");
        }
        return failure("unavailable");
      }
    } catch (error) {
      if (began && !terminal) await rollback(client); else if (!terminal) release(client, true);
      if (error instanceof StorefrontHostedCheckoutRepositoryError) throw error;
      return failure("unavailable");
    }
  }
  async expireCreated(value: Readonly<{ now: Date; limit: number }>): Promise<number> {
    const parsed = input(value);
    const row = await this.execute(
      "SELECT 'expired'::text AS outcome,pg_catalog.jsonb_build_object('expiredCount',saas.storefront_hosted_checkout_expire_created($1::timestamptz,$2::integer)) AS result_payload",
      [parsed.now, parsed.limit], false,
    );
    if (row.outcome !== "expired") return failure("unavailable");
    const result = exact(row.result, ["expiredCount"]);
    if (!Number.isSafeInteger(result.expiredCount) || (result.expiredCount as number) < 0 || (result.expiredCount as number) > parsed.limit) failure("unavailable");
    return result.expiredCount as number;
  }
  async reconciliationCandidates(value: Readonly<{ now: Date; limit: number }>): Promise<readonly StorefrontHostedCheckoutReconciliationCandidate[]> {
    const parsed = input(value);
    const row = await this.execute(
      `SELECT 'found'::text AS outcome,pg_catalog.jsonb_build_object(
        'candidates',COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'attemptId',candidate.attempt_id,'attemptVersion',candidate.attempt_version,
          'attemptStatus',candidate.attempt_status,'credentialVersion',candidate.credential_version,
          'providerReference',candidate.provider_reference
        ) ORDER BY candidate.attempt_id),'[]'::jsonb)
      ) AS result_payload
      FROM saas.storefront_hosted_checkout_reconciliation_candidates($1::timestamptz,$2::integer) candidate`,
      [parsed.now, parsed.limit], true,
    );
    if (row.outcome !== "found") return failure("unavailable");
    const result = exact(row.result, ["candidates"]);
    if (!Array.isArray(result.candidates) || nodeTypes.isProxy(result.candidates)
      || Object.getPrototypeOf(result.candidates) !== Array.prototype || result.candidates.length > parsed.limit) failure("unavailable");
    const arrayDescriptors = Object.getOwnPropertyDescriptors(result.candidates) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(arrayDescriptors).length !== result.candidates.length + 1) failure("unavailable");
    return Object.freeze(result.candidates.map((candidate, index) => {
      if (!arrayDescriptors[String(index)]?.enumerable || !("value" in arrayDescriptors[String(index)])) failure("unavailable");
      const item = exact(candidate, ["attemptId", "attemptVersion", "attemptStatus", "credentialVersion", "providerReference"]);
      if (typeof item.attemptId !== "string" || !UUID.test(item.attemptId)
        || !Number.isSafeInteger(item.attemptVersion) || (item.attemptVersion as number) < 1
        || typeof item.attemptStatus !== "string" || !STATUS.has(item.attemptStatus)
        || !Number.isSafeInteger(item.credentialVersion) || (item.credentialVersion as number) < 1
        || (item.providerReference !== null && (typeof item.providerReference !== "string"
          || item.providerReference.length < 1 || item.providerReference.length > 256
          || item.providerReference !== item.providerReference.trim() || CONTROL.test(item.providerReference)))) failure("unavailable");
      return Object.freeze({
        attemptId: item.attemptId,
        attemptVersion: item.attemptVersion as number,
        attemptStatus: item.attemptStatus as StorefrontHostedCheckoutReconciliationCandidate["attemptStatus"],
        credentialVersion: item.credentialVersion as number,
        providerReference: item.providerReference as string | null,
      });
    }));
  }
}
