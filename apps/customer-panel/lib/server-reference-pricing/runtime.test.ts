import assert from "node:assert/strict";
import test from "node:test";

import type { ReferencePricingRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

const METHODS = ["listDefinitions", "list", "get", "getPolicy", "preview", "define", "saveSet", "activate", "savePolicy"] as const;

function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime {
  return Object.freeze({ readiness: Object.freeze({ mode }), panelOrigin: mode === "approved_staging" ? "https://panel.test" : null }) as ServerPanelAccessRuntime;
}

function repository(): ReferencePricingRepository {
  return Object.fromEntries(METHODS.map((method) => [method, async () => { throw new Error("unused"); }])) as unknown as ReferencePricingRepository;
}

async function runtimeModule() {
  try { return await import("./runtime.ts"); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") assert.fail("server-reference-pricing runtime is not implemented yet");
    throw error;
  }
}

test("reference-pricing runtime exposes a complete approved-staging-only facade once", async () => {
  const { registerServerReferencePricingRepository, resolveServerReferencePricingRuntime } = await runtimeModule();
  const approved = access();
  registerServerReferencePricingRepository(approved, repository());
  const runtime = resolveServerReferencePricingRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.referencePricing).sort(), [...METHODS].sort());
  assert.equal(resolveServerReferencePricingRuntime(access("disabled")), null);
  assert.throws(() => registerServerReferencePricingRepository(access("disabled"), repository()), /server_reference_pricing_runtime_invalid/);
  assert.throws(() => registerServerReferencePricingRepository(approved, repository()), /server_reference_pricing_runtime_invalid/);
});
