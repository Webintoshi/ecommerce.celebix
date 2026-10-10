import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("optional promotion methods survive registration and keep their repository receiver", async () => {
  for (const method of ["apply", "deletionImpact", "delete"] as const) {
    const approved = access();
    const input = Object.freeze({ operationId: "10000000-0000-4000-8000-000000000001" });
    const result = Object.freeze({ applied: true });
    let calls = 0;
    const implementation = Object.assign(repository(), {
      async [method](this: PromotionRepository, received: unknown) {
        assert.equal(this, implementation);
        assert.equal(received, input);
        calls++;
        return result;
      },
    }) as unknown as PromotionRepository;
    registerServerPromotionsRepository(approved, implementation);
    const runtime = resolveServerPromotionsRuntime(approved);
    assert.ok(runtime);
    const operation = runtime.promotions[method] as unknown as (input: unknown) => Promise<unknown>;
    assert.equal(typeof operation, "function", method);
    assert.equal(await operation(input), result);
    assert.equal(calls, 1);
    assert.equal(Object.isFrozen(runtime.promotions), true);
  }
});


import type { PromotionRepository } from "@celebix/saas-data";
import type { TenantContext } from "@celebix/saas-contracts";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { createPromotionsHttpHandler } from "../promotions-http/handler.ts";
import { registerServerPromotionsRepository, resolveServerPromotionsRuntime } from "./runtime.ts";

const METHODS = [
  "timezone", "storefrontOrigin", "list", "detail", "create", "update", "publish", "pause", "resume", "duplicate", "archive",
  "simulate", "conflicts", "margin", "listTargets", "resolveTargets", "createCodeBatch",
  "updateCodeBatchStatus", "listCodeBatches", "exportCodes", "analytics", "analyticsDetail", "overview", "listLegacy", "resolveLegacy",
] as const;

const REQUIRED_PROCEDURES = [
  "saas.promotion_store_timezone_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "saas.promotion_storefront_origin_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
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
  "saas.promotion_analytics_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer)",
  "saas.promotion_overview_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer)",
  "saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)",
  "saas.promotion_legacy_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
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

test("malformed optional promotion methods reject registration", () => {
  for (const method of ["apply", "deletionImpact", "delete"] as const) {
    for (const value of [null, true, "not a function"]) {
      const approved = access();
      const malformed = Object.assign(repository(), { [method]: value }) as unknown as PromotionRepository;
      assert.throws(() => registerServerPromotionsRepository(approved, malformed), /server_promotions_runtime_invalid/, method);
      assert.equal(resolveServerPromotionsRuntime(approved), null);
    }
  }
});

test("authenticated deletion preview and mutation use the registered promotions facade", async () => {
  const promotionId = "20000000-0000-4000-8000-000000000001";
  const operationId = "40000000-0000-4000-8000-000000000001";
  const now = new Date("2026-10-09T20:00:00.000Z");
  const tenantContext: TenantContext = {
    schemaVersion: 1, requestId: "50000000-0000-4000-8000-000000000001",
    principal: { id: "10000000-0000-4000-8000-000000000002", issuer: "https://identity.test/oidc", subject: "test" },
    store: { id: "10000000-0000-4000-8000-000000000001", slug: "atlas-store", status: "active" },
    membership: { id: "10000000-0000-4000-8000-000000000003", role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1, planId: "10000000-0000-4000-8000-000000000004", planCode: "growth", version: 2,
      status: "active", features: ["promotions"], limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    }, locale: "tr-TR",
  };
  const approved: ServerPanelAccessRuntime = Object.freeze({
    ...access(),
    async resolveCredential() { return { kind: "authenticated" as const, session: {} as never, tenantContext }; },
  });
  const impact = { id: promotionId, version: 7, name: "Atlas", codeCount: 2, preservedRedemptionCount: 3, pendingReservationCount: 0, linkedTools: [], canDelete: true };
  const receipt = { id: promotionId, deletedAt: now.toISOString(), replayed: false };
  const calls: string[] = [];
  const implementation = Object.assign(repository(), {
    async deletionImpact(input: Parameters<NonNullable<PromotionRepository["deletionImpact"]>>[0]) {
      assert.equal(this, implementation);
      assert.deepEqual(input, { tenantContext, now, promotionId });
      calls.push("impact");
      return impact;
    },
    async delete(input: Parameters<NonNullable<PromotionRepository["delete"]>>[0]) {
      assert.equal(this, implementation);
      assert.deepEqual(input, { tenantContext, now, promotionId, operationId, expectedVersion: 7 });
      calls.push("delete");
      return receipt;
    },
  });
  registerServerPromotionsRepository(approved, implementation);
  const handle = createPromotionsHttpHandler({
    async resolveRuntime() { return resolveServerPromotionsRuntime(approved); },
    now: () => new Date(now), requestId: () => tenantContext.requestId,
  });
  const cookie = `__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
  const preview = await handle(new Request(`http://internal:3400/api/promotions/${promotionId}/delete-impact`, { headers: { cookie } }));
  assert.equal(preview.status, 200);
  assert.deepEqual(await preview.json(), impact);
  const deleted = await handle(new Request(`http://internal:3400/api/promotions/${promotionId}/delete`, {
    method: "POST", headers: { cookie, origin: approved.panelOrigin!, "content-type": "application/json", "idempotency-key": operationId },
    body: JSON.stringify({ expectedVersion: 7 }),
  }));
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), receipt);
  assert.deepEqual(calls, ["impact", "delete"]);
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
  assert.match(source, /registerServerPromotionsRepository\(access, createPostCommitInvalidatingRepository\(promotionRepository, \{[\s\S]*?create: \["promotions"\],[\s\S]*?update: \["promotions"\],[\s\S]*?publish: \["promotions"\],[\s\S]*?pause: \["promotions"\],[\s\S]*?resume: \["promotions"\],[\s\S]*?duplicate: \["promotions"\],[\s\S]*?archive: \["promotions"\],[\s\S]*?\}\)\)/u);
  assert.ok(source.indexOf("await preflight(pool, config.database.name)") < source.indexOf("new PostgresPromotionRepository"));
  assert.ok(source.indexOf("new PostgresPromotionRepository") < source.indexOf("registerServerPromotionsRepository(access, createPostCommitInvalidatingRepository(promotionRepository"));
});
