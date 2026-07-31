import { createHash } from "node:crypto";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { STOREFRONT_CONTENT_ERROR_CODES, StorefrontContentRepositoryError, type StorefrontContentErrorCode } from "./errors.ts";
import type {
  PostgresPublicStorefrontContentRepositoryOptions,
  PostgresStorePolicyAdminRepositoryOptions,
  PublicStorefrontContentRepository,
  StorePolicyAdminPage,
  StorePolicyAdminRepository,
} from "./types.ts";
import {
  exactStorefrontContentInput,
  parsePolicyIndexPayload,
  parseProductSearchPayload,
  parsePublicPolicySource,
  parseResolvedProductsPayload,
  parseStorePolicyAdminList,
  parseStorePolicyAdminPage,
  storefrontContentAuthority,
  storefrontContentBody,
  storefrontContentCursor,
  storefrontContentDate,
  storefrontContentHostname,
  storefrontContentLimit,
  storefrontContentPolicyKey,
  storefrontContentProductIds,
  storefrontContentQuery,
  storefrontContentStatus,
  storefrontContentUuid,
  storefrontContentVersion,
} from "./validation.ts";

type Envelope = Readonly<{ outcome: string; result: unknown }>;
type Query = Readonly<{ text: string; values: unknown[] }>;
const ERROR_CODES = new Set<string>(STOREFRONT_CONTENT_ERROR_CODES);

function failure(code: StorefrontContentErrorCode = "unavailable"): StorefrontContentRepositoryError {
  return new StorefrontContentRepositoryError(code);
}
function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch {}
}
function envelope(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Envelope {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw failure();
  const parsed = exactStorefrontContentInput(result.rows[0], ["outcome", "result_payload"], [], "unavailable");
  if (typeof parsed.outcome !== "string") throw failure();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}
function mapped(outcome: string): StorefrontContentRepositoryError | undefined {
  return ERROR_CODES.has(outcome) ? failure(outcome as StorefrontContentErrorCode) : undefined;
}
function authorityValues(authority: ReturnType<typeof storefrontContentAuthority>): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}
function policyFingerprint(input: Readonly<{ storeId: string; key: string; expectedVersion: number; body: string; status: string }>): string {
  const canonical = JSON.stringify(["store-policy/save/v1", input.storeId, input.key, input.expectedVersion, input.body, input.status]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

abstract class PostgresStorefrontContentBase {
  protected readonly pool: PostgresPublicStorefrontContentRepositoryOptions["pool"];
  protected readonly timeouts: PostgresPublicStorefrontContentRepositoryOptions["timeouts"];
  protected readonly role: "celebix_saas_host_resolver" | "celebix_saas_app";

  protected constructor(options: PostgresPublicStorefrontContentRepositoryOptions | PostgresStorePolicyAdminRepositoryOptions) {
    this.pool = options.pool;
    this.timeouts = options.timeouts;
    this.role = options.role;
  }

  protected async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.pool, this.timeouts.poolCheckoutMs); } catch { throw failure(); }
  }

  protected async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.timeouts.idleTransactionMs)]);
    await client.query(`SET LOCAL ROLE ${this.role}`);
  }

  protected async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }

  protected async read<T>(query: Query, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const selected = envelope(await client.query(query.text, query.values));
      const error = mapped(selected.outcome);
      if (error) throw error;
      if (selected.outcome !== expected) throw failure();
      const result = parser(selected.result);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
      } catch {
        terminal = true;
        release(client, true);
        throw failure();
      }
      return result;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!terminal) release(client, true);
      if (error instanceof StorefrontContentRepositoryError) throw error;
      throw failure();
    }
  }
}

function validateOptions(
  value: unknown,
  keys: readonly string[],
  role: "celebix_saas_host_resolver" | "celebix_saas_app",
): asserts value is PostgresPublicStorefrontContentRepositoryOptions | PostgresStorePolicyAdminRepositoryOptions {
  const options = exactStorefrontContentInput(value, keys, [], "unavailable");
  if (options.role !== role || !options.pool || typeof (options.pool as { connect?: unknown }).connect !== "function") throw failure();
  const timeouts = exactStorefrontContentInput(options.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"], [], "unavailable");
  for (const selected of Object.values(timeouts)) timeout(selected as number);
}

export class PostgresPublicStorefrontContentRepository extends PostgresStorefrontContentBase implements PublicStorefrontContentRepository {
  constructor(options: PostgresPublicStorefrontContentRepositoryOptions) {
    validateOptions(options, ["pool", "role", "timeouts"], "celebix_saas_host_resolver");
    super(Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) }));
  }

  async listPolicies(input: Parameters<PublicStorefrontContentRepository["listPolicies"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now"]);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.public_policy_index($1::text,$2::timestamptz)",
      values: [storefrontContentHostname(parsed.hostname), storefrontContentDate(parsed.now)],
    }, "found", parsePolicyIndexPayload);
  }

  async getPolicy(input: Parameters<PublicStorefrontContentRepository["getPolicy"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now", "key"]);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.public_policy_get($1::text,$2::timestamptz,$3::text)",
      values: [storefrontContentHostname(parsed.hostname), storefrontContentDate(parsed.now), storefrontContentPolicyKey(parsed.key)],
    }, "found", parsePublicPolicySource);
  }

  async search(input: Parameters<PublicStorefrontContentRepository["search"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now", "query", "limit"], ["cursor"]);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.public_search_products($1::text,$2::timestamptz,$3::text,$4::integer,$5::text)",
      values: [storefrontContentHostname(parsed.hostname), storefrontContentDate(parsed.now), storefrontContentQuery(parsed.query), storefrontContentLimit(parsed.limit), storefrontContentCursor(parsed.cursor) ?? null],
    }, "found", parseProductSearchPayload);
  }

  async resolveProductIds(input: Parameters<PublicStorefrontContentRepository["resolveProductIds"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now", "productIds"]);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.public_resolve_product_ids($1::text,$2::timestamptz,$3::uuid[])",
      values: [storefrontContentHostname(parsed.hostname), storefrontContentDate(parsed.now), storefrontContentProductIds(parsed.productIds)],
    }, "found", parseResolvedProductsPayload);
  }
}

export class PostgresStorePolicyAdminRepository extends PostgresStorefrontContentBase implements StorePolicyAdminRepository {
  private readonly audit: PostgresStorePolicyAdminRepositoryOptions["audit"];

  constructor(options: PostgresStorePolicyAdminRepositoryOptions) {
    validateOptions(options, ["pool", "role", "timeouts", "audit"], "celebix_saas_app");
    if (typeof options.audit !== "function") throw failure();
    super(Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) }));
    this.audit = options.audit;
  }

  private emitUnknown(): void {
    try {
      const pending = this.audit(Object.freeze({ type: "store_policy_commit_unknown" }));
      if (pending) void pending.catch(() => undefined);
    } catch {}
  }

  async list(input: Parameters<StorePolicyAdminRepository["list"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["tenantContext", "now"]);
    const authority = storefrontContentAuthority(parsed.tenantContext, parsed.now);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.store_policy_list_admin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      values: authorityValues(authority),
    }, "listed", parseStorePolicyAdminList);
  }

  private async recover(authority: ReturnType<typeof storefrontContentAuthority>, operationId: string, fingerprint: string, observed: StorePolicyAdminPage): Promise<StorePolicyAdminPage> {
    try {
      const recovered = await this.read({
        text: "SELECT outcome,result_payload FROM saas.store_policy_recover($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
        values: [...authorityValues(authority), operationId, fingerprint],
      }, "operation_replayed", parseStorePolicyAdminPage);
      if (JSON.stringify(recovered) !== JSON.stringify(observed)) throw failure("commit_unknown");
      return recovered;
    } catch {
      throw failure("commit_unknown");
    }
  }

  async save(input: Parameters<StorePolicyAdminRepository["save"]>[0]): Promise<StorePolicyAdminPage> {
    const parsed = exactStorefrontContentInput(input, ["tenantContext", "now", "operationId", "key", "expectedVersion", "body", "status"]);
    const authority = storefrontContentAuthority(parsed.tenantContext, parsed.now);
    const operationId = storefrontContentUuid(parsed.operationId);
    const key = storefrontContentPolicyKey(parsed.key);
    const expectedVersion = storefrontContentVersion(parsed.expectedVersion);
    const status = storefrontContentStatus(parsed.status);
    const body = storefrontContentBody(parsed.body, status);
    const fingerprint = policyFingerprint({ storeId: authority.storeId, key, expectedVersion, body, status });
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    let observed: StorePolicyAdminPage | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const selected = envelope(await client.query(
        "SELECT outcome,result_payload FROM saas.store_policy_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text,$11::bigint,$12::text,$13::text)",
        [...authorityValues(authority), operationId, fingerprint, key, expectedVersion, body, status],
      ));
      const error = mapped(selected.outcome);
      if (error) throw error;
      if (selected.outcome !== "saved" && selected.outcome !== "operation_replayed") throw failure();
      observed = parseStorePolicyAdminPage(selected.result);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return observed;
      } catch {
        terminal = true;
        release(client, true);
        this.emitUnknown();
        return await this.recover(authority, operationId, fingerprint, observed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!terminal) release(client, true);
      if (error instanceof StorefrontContentRepositoryError) throw error;
      throw failure();
    }
  }
}
