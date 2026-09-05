import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PromotionRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerPromotionsRepository, resolveServerPromotionsRuntime } from "./runtime.ts";

const METHODS = [
  "list", "detail", "create", "update", "publish", "pause", "resume", "duplicate", "archive",
  "simulate", "conflicts", "margin", "listTargets", "resolveTargets", "createCodeBatch",
  "updateCodeBatchStatus", "listCodeBatches", "exportCodes", "analytics", "listLegacy",
] as const;

const REQUIRED_PROCEDURES = [
  "saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],text[],text[],text[],timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)",
  "saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)",
  "saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)",
  "saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
  "saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text[])",
  "saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb,jsonb)",
  "saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb)",
  "saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb)",
  "saas.promotion_picker_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,integer,text,uuid)",
  "saas.promotion_picker_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])",
  "saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text,integer,integer,timestamp with time zone)",
  "saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
  "saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone,uuid)",
  "saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)",
  "saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)",
] as const;

function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode }),
    panelOrigin: mode === "approved_staging" ? "https://panel.saas-staging.celebix.site" : null,
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function repository(): PromotionRepository {
  const reject = async () => { throw new Error("unused"); };
  return Object.fromEntries(METHODS.map((method) => [method, reject])) as unknown as PromotionRepository;
}

test("approved staging resolves only a frozen complete promotions facade", () => {
  const approved = access();
  registerServerPromotionsRepository(approved, repository());
  const runtime = resolveServerPromotionsRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.promotions), true);
  assert.deepEqual(Object.keys(runtime.promotions).sort(), [...METHODS].sort());
  for (const forbidden of ["pool", "options", "database", "connectionString", "tenantContext", "recover"]) {
    assert.equal(forbidden in runtime.promotions, false, forbidden);
  }
});

test("disabled, malformed, hostile and duplicate promotions registration fail closed", () => {
  assert.equal(resolveServerPromotionsRuntime(access("disabled")), null);
  assert.throws(() => registerServerPromotionsRepository(access("disabled"), repository()), /server_promotions_runtime_invalid/);
  const approved = access();
  assert.throws(() => registerServerPromotionsRepository(approved, {} as PromotionRepository), /server_promotions_runtime_invalid/);
  registerServerPromotionsRepository(approved, repository());
  assert.throws(() => registerServerPromotionsRepository(approved, repository()), /server_promotions_runtime_invalid/);
  const hostile = new Proxy({} as ServerPanelAccessRuntime, { get() { throw new Error("private"); } });
  assert.equal(resolveServerPromotionsRuntime(hostile), null);
  assert.throws(() => registerServerPromotionsRepository(hostile, repository()), /^Error: server_promotions_runtime_invalid$/);
});

test("approved staging preflights migration 126 and registers one narrow repository on the shared pool", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/gu) ?? []).length, 1);
  for (const relation of [
    "promotions", "promotion_versions", "promotion_targets", "promotion_code_batches", "promotion_codes",
    "promotion_operations", "promotion_usage_reservations", "promotion_redemptions", "promotion_audit_events",
    "order_promotion_snapshots", "order_discount_allocations",
  ]) assert.match(source, new RegExp(`to_regclass\\('saas\\.${relation}'\\) IS NOT NULL`), relation);
  for (const procedure of REQUIRED_PROCEDURES) {
    assert.equal(source.includes(`to_regprocedure('${procedure}') IS NOT NULL`), true, `${procedure} exists`);
    assert.equal(source.includes(`has_function_privilege(\n          'celebix_saas_app',\n          '${procedure}',\n          'EXECUTE'\n        )`), true, `${procedure} executable`);
  }
  assert.match(source, /new PostgresPromotionRepository\(\{[\s\S]*?pool,[\s\S]*?role: "celebix_saas_app"[\s\S]*?timeouts: TIMEOUTS,[\s\S]*?uuid: randomUUID,[\s\S]*?audit:/u);
  assert.match(source, /registerServerPromotionsRepository\(access, promotionRepository\)/u);
  assert.ok(source.indexOf("await preflight(pool, config.database.name)") < source.indexOf("new PostgresPromotionRepository"));
  assert.ok(source.indexOf("new PostgresPromotionRepository") < source.indexOf("registerServerPromotionsRepository(access, promotionRepository)"));
});
