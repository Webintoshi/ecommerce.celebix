import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PricingRepository } from "@celebix/saas-data";
import { registerServerPricingRepository, resolveServerPricingRuntime } from "./runtime.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

const METHODS = ["list", "get", "save", "activate", "archive", "preview"] as const;
function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime { return Object.freeze({ readiness: Object.freeze({ mode }), panelOrigin: mode === "approved_staging" ? "https://panel.test" : null }) as ServerPanelAccessRuntime; }
function repository(): PricingRepository { return Object.fromEntries(METHODS.map((method) => [method, async () => { throw new Error("unused"); }])) as unknown as PricingRepository; }

test("pricing runtime registers only one complete frozen approved-staging facade", () => {
  const approved = access();
  registerServerPricingRepository(approved, repository());
  const runtime = resolveServerPricingRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.pricing).sort(), [...METHODS].sort());
  assert.equal(resolveServerPricingRuntime(access("disabled")), null);
  assert.throws(() => registerServerPricingRepository(access("disabled"), repository()), /server_pricing_runtime_invalid/);
  assert.throws(() => registerServerPricingRepository(approved, repository()), /server_pricing_runtime_invalid/);
});

test("panel runtime preflights migration 045 and registers pricing only after durable access initialization", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  for (const relation of ["price_lists", "price_list_items", "price_list_rules", "price_list_operations"]) assert.match(source, new RegExp(`to_regclass\\('saas\\.${relation}'\\) IS NOT NULL`));
  for (const signature of [
    "pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)", "pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb,jsonb)",
    "pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
    "pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])",
    "resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)",
  ]) assert.equal(source.includes(`to_regprocedure('saas.${signature}') IS NOT NULL`), true, signature);
  assert.match(source, /new PostgresPricingRepository\(/);
  assert.match(source, /registerServerPricingRepository\(access, pricingRepository\)/);
  assert.ok(source.indexOf("await preflight") < source.indexOf("new PostgresPricingRepository"));
  assert.ok(source.indexOf("const access = createApprovedStagingServerPanelAccessRuntime") < source.lastIndexOf("registerServerPricingRepository"));
  for (const browserFile of ["../pricing-http/handler.ts", "../pricing-ui/client.ts"]) {
    assert.equal(readFileSync(new URL(browserFile, import.meta.url), "utf8").includes("resolve_effective_variant_price"), false);
  }
});
