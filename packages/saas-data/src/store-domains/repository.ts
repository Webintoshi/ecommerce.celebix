import { randomUUID } from "node:crypto";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { StoreDomainRepositoryError, type StoreDomainRepositoryErrorCode } from "./errors.ts";
import type {
  PostgresStoreDomainRepositoryOptions,
  PostgresStoreDomainOriginHealthRepositoryOptions,
  PostgresStoreDomainWorkflowRepositoryOptions,
  StoreDomainOriginHealthRepository,
  StoreDomainRepository,
  StoreDomainWorkflowRepository,
} from "./types.ts";
import {
  authorityValues,
  adminDomainView,
  date,
  domainView,
  exact,
  fingerprint,
  hostname,
  originHealth,
  safeError,
  safeId,
  uuid,
  version,
  workflowClaim,
} from "./validation.ts";

type Options = PostgresStoreDomainRepositoryOptions | PostgresStoreDomainOriginHealthRepositoryOptions | PostgresStoreDomainWorkflowRepositoryOptions;

function failure(code: StoreDomainRepositoryErrorCode): StoreDomainRepositoryError {
  return new StoreDomainRepositoryError(code);
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable");
  return `${value}ms`;
}

function resultRow(rows: unknown[]): Readonly<{ outcome: string; payload: unknown }> {
  if (rows.length !== 1) throw failure("unavailable");
  const parsed = exact(rows[0], ["outcome", "result_payload"], "unavailable");
  if (typeof parsed.outcome !== "string") throw failure("unavailable");
  return Object.freeze({ outcome: parsed.outcome, payload: parsed.result_payload });
}

function mappedOutcome(outcome: string): StoreDomainRepositoryErrorCode {
  if (outcome === "invalid_input" || outcome === "durable_authority_invalid") return "invalid_input";
  if (outcome === "feature_not_enabled" || outcome === "membership_denied" || outcome === "store_inactive") return "feature_not_enabled";
  if (outcome === "limit_reached") return "limit_reached";
  if (outcome === "hostname_already_claimed") return "hostname_already_claimed";
  if (outcome === "stale_version" || outcome === "not_ready") return "stale_version";
  if (outcome === "domain_not_found" || outcome === "not_found") return "not_found";
  if (outcome === "operation_mismatch") return "operation_mismatch";
  return "unavailable";
}

abstract class PostgresStoreDomainBase {
  protected readonly options: Options;
  constructor(options: Options, expectedRole: Options["role"]) {
    if (!options || options.role !== expectedRole || !options.pool || !options.timeouts) throw failure("unavailable");
    timeout(options.timeouts.poolCheckoutMs);
    timeout(options.timeouts.statementMs);
    timeout(options.timeouts.lockMs);
    timeout(options.timeouts.idleTransactionMs);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query(`SET LOCAL ROLE ${this.options.role}`);
  }
  protected async execute(text: string, values: unknown[], readOnly: boolean): Promise<Readonly<{ outcome: string; payload: unknown }>> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw failure("unavailable"); }
    let began = false;
    let terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
      began = true;
      await this.configure(client);
      const selected = resultRow((await client.query(text, values)).rows);
      await client.query("COMMIT");
      terminal = true;
      client.release();
      return selected;
    } catch (caught) {
      if (began && !terminal) {
        try { await client.query("ROLLBACK"); client.release(); }
        catch { client.release(true); }
      } else if (!terminal) client.release(true);
      if (caught instanceof StoreDomainRepositoryError) throw caught;
      throw failure("unavailable");
    }
  }
}

export class PostgresStoreDomainOriginHealthRepository extends PostgresStoreDomainBase implements StoreDomainOriginHealthRepository {
  constructor(options: PostgresStoreDomainOriginHealthRepositoryOptions) { super(options, "celebix_saas_host_resolver"); }

  async get(input: Parameters<StoreDomainOriginHealthRepository["get"]>[0]) {
    const parsed = exact(input, ["hostname", "now"]);
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.resolve_store_domain_origin_health($1::text,$2::timestamptz)",
      [hostname(parsed.hostname), date(parsed.now)],
      true,
    );
    if (result.outcome !== "found") throw failure(mappedOutcome(result.outcome));
    return originHealth(result.payload);
  }
}

export class PostgresStoreDomainRepository extends PostgresStoreDomainBase implements StoreDomainRepository {
  constructor(options: PostgresStoreDomainRepositoryOptions) { super(options, "celebix_saas_app"); }

  private authority(input: { tenantContext: unknown; now: unknown }): readonly unknown[] {
    return Object.freeze([...authorityValues(input.tenantContext), date(input.now)]);
  }

  private selected(result: Readonly<{ outcome: string; payload: unknown }>, accepted: readonly string[]) {
    if (!accepted.includes(result.outcome)) throw failure(mappedOutcome(result.outcome));
    return domainView(result.payload);
  }

  async list(input: Parameters<StoreDomainRepository["list"]>[0]) {
    const parsed = exact(input, ["tenantContext", "now"]);
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.merchant_store_domain_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      [...this.authority(parsed as never)],
      true,
    );
    if (result.outcome !== "listed") throw failure(mappedOutcome(result.outcome));
    const payload = exact(result.payload, ["items"], "unavailable");
    if (!Array.isArray(payload.items) || payload.items.length > 16) throw failure("unavailable");
    return Object.freeze(payload.items.map(domainView));
  }

  async prepareCreate(input: Parameters<StoreDomainRepository["prepareCreate"]>[0]) {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "fingerprint", "domainId", "hostname", "provider", "cnameTarget"]);
    if (parsed.provider !== "cloudflare_for_saas") throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.merchant_store_domain_prepare_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::text)",
      [...this.authority(parsed as never), uuid(parsed.operationId), fingerprint(parsed.fingerprint), uuid(parsed.domainId), hostname(parsed.hostname), parsed.provider, hostname(parsed.cnameTarget)],
      false,
    );
    return Object.freeze({
      domain: this.selected(result, ["prepared", "operation_replayed"]),
      replayed: result.outcome === "operation_replayed",
    });
  }

  async prepareBundle(input: Parameters<StoreDomainRepository["prepareBundle"]>[0]) {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "fingerprint", "domainId", "hostname", "provider", "cnameTarget", "adminDomainId", "adminHostname", "adminCnameTarget"]);
    if (parsed.provider !== "cloudflare_for_saas") throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.merchant_store_domain_bundle_prepare_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::text,$14::uuid,$15::text,$16::text)",
      [...this.authority(parsed as never), uuid(parsed.operationId), fingerprint(parsed.fingerprint), uuid(parsed.domainId), hostname(parsed.hostname), parsed.provider, hostname(parsed.cnameTarget), uuid(parsed.adminDomainId), hostname(parsed.adminHostname), hostname(parsed.adminCnameTarget)],
      false,
    );
    if (result.outcome !== "prepared" && result.outcome !== "operation_replayed") throw failure(mappedOutcome(result.outcome));
    const payload = exact(result.payload, ["storefront", "admin"], "unavailable");
    return Object.freeze({
      storefront: domainView(payload.storefront),
      admin: adminDomainView(payload.admin),
      replayed: result.outcome === "operation_replayed",
    });
  }

  async bindProvider(input: Parameters<StoreDomainRepository["bindProvider"]>[0]) {
    const parsed = exact(input, ["tenantContext", "now", "domainId", "expectedVersion", "providerHostnameId", "ownershipValidation", "certificateValidation"]);
    if (!Array.isArray(parsed.ownershipValidation) || !Array.isArray(parsed.certificateValidation)) throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.merchant_store_domain_bind_provider($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::text,$11::jsonb,$12::jsonb)",
      [...this.authority(parsed as never), uuid(parsed.domainId), version(parsed.expectedVersion), safeId(parsed.providerHostnameId), JSON.stringify(parsed.ownershipValidation), JSON.stringify(parsed.certificateValidation)],
      false,
    );
    return this.selected(result, ["bound"]);
  }

  private async versioned(name: "request_recheck" | "make_primary" | "disable", input: Parameters<StoreDomainRepository["requestRecheck"]>[0]) {
    const parsed = exact(input, ["tenantContext", "now", "domainId", "expectedVersion"]);
    const result = await this.execute(
      `SELECT outcome,result_payload FROM saas.merchant_store_domain_${name === "request_recheck" ? name : `bundle_${name}`}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint)`,
      [...this.authority(parsed as never), uuid(parsed.domainId), version(parsed.expectedVersion)],
      false,
    );
    return this.selected(result, [name === "request_recheck" ? "queued" : name === "make_primary" ? "activated" : "disabled"]);
  }

  requestRecheck(input: Parameters<StoreDomainRepository["requestRecheck"]>[0]) { return this.versioned("request_recheck", input); }
  makePrimary(input: Parameters<StoreDomainRepository["makePrimary"]>[0]) { return this.versioned("make_primary", input); }
  disable(input: Parameters<StoreDomainRepository["disable"]>[0]) { return this.versioned("disable", input); }
}

export class PostgresStoreDomainWorkflowRepository extends PostgresStoreDomainBase implements StoreDomainWorkflowRepository {
  constructor(options: PostgresStoreDomainWorkflowRepositoryOptions) { super(options, "celebix_saas_workflow"); }

  async claim(input: Parameters<StoreDomainWorkflowRepository["claim"]>[0]) {
    const parsed = exact(input, ["workerId", "now", "leaseExpiresAt", "limit"]);
    const now = date(parsed.now);
    const leaseExpiresAt = date(parsed.leaseExpiresAt);
    if (!Number.isSafeInteger(parsed.limit) || (parsed.limit as number) < 1 || (parsed.limit as number) > 20 || leaseExpiresAt <= now) throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.store_domain_work_claim($1::text,$2::timestamptz,$3::timestamptz,$4::integer,$5::uuid)",
      [safeId(parsed.workerId), now, leaseExpiresAt, parsed.limit, randomUUID()],
      false,
    );
    if (result.outcome !== "claimed") throw failure(mappedOutcome(result.outcome));
    const payload = exact(result.payload, ["items"], "unavailable");
    if (!Array.isArray(payload.items) || payload.items.length > (parsed.limit as number)) throw failure("unavailable");
    return Object.freeze(payload.items.map(workflowClaim));
  }

  async complete(input: Parameters<StoreDomainWorkflowRepository["complete"]>[0]): Promise<void> {
    const parsed = exact(input, ["domainId", "leaseId", "workerId", "now", "hostnameStatus", "sslStatus", "dnsStatus", "originStatus", "safeProviderErrorCode", "nextCheckAt"]);
    const hostnameStatuses = ["pending", "active", "failed", "deleted"];
    const sslStatuses = ["pending", "active", "failed", "deleted"];
    const dnsStatuses = ["pending", "ready", "mismatch"];
    const originStatuses = ["pending", "ready", "failed"];
    if (!hostnameStatuses.includes(String(parsed.hostnameStatus)) || !sslStatuses.includes(String(parsed.sslStatus)) || !dnsStatuses.includes(String(parsed.dnsStatus)) || !originStatuses.includes(String(parsed.originStatus))) throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.store_domain_work_complete($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::text,$7::text,$8::text,$9::text,$10::timestamptz)",
      [uuid(parsed.domainId), uuid(parsed.leaseId), safeId(parsed.workerId), date(parsed.now), parsed.hostnameStatus, parsed.sslStatus, parsed.dnsStatus, parsed.originStatus, safeError(parsed.safeProviderErrorCode), date(parsed.nextCheckAt)],
      false,
    );
    if (result.outcome !== "completed") throw failure(mappedOutcome(result.outcome));
  }

  async defer(input: Parameters<StoreDomainWorkflowRepository["defer"]>[0]): Promise<void> {
    const parsed = exact(input, ["domainId", "leaseId", "workerId", "now", "retryAt"]);
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.store_domain_work_defer($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::timestamptz)",
      [uuid(parsed.domainId), uuid(parsed.leaseId), safeId(parsed.workerId), date(parsed.now), date(parsed.retryAt)],
      false,
    );
    if (result.outcome !== "retry_scheduled") throw failure(mappedOutcome(result.outcome));
  }

  async fail(input: Parameters<StoreDomainWorkflowRepository["fail"]>[0]): Promise<void> {
    const parsed = exact(input, ["domainId", "leaseId", "workerId", "now", "errorCode", "retryAt", "terminal"]);
    if (typeof parsed.terminal !== "boolean") throw failure("invalid_input");
    const result = await this.execute(
      "SELECT outcome,result_payload FROM saas.store_domain_work_fail($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::timestamptz,$7::boolean)",
      [uuid(parsed.domainId), uuid(parsed.leaseId), safeId(parsed.workerId), date(parsed.now), safeError(parsed.errorCode), date(parsed.retryAt), parsed.terminal],
      false,
    );
    if (result.outcome !== (parsed.terminal ? "failed" : "retry_scheduled")) throw failure(mappedOutcome(result.outcome));
  }
}
