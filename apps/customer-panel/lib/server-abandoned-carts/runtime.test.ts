import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AbandonedCartRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerAbandonedCartRepository, resolveServerAbandonedCartRuntime } from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime {
  return {
    readiness: { mode }, panelOrigin: mode === "approved_staging" ? "https://panel.saas-staging.celebix.site" : null,
    async resolveCredential() { return { kind: "unauthenticated" as const }; },
    async rotateCredential() { return { kind: "unavailable" as const }; },
    async revokeCredential() { return { kind: "unavailable" as const }; },
  };
}

function repository(): AbandonedCartRepository {
  const reject = async () => { throw new Error("unused"); };
  return { getSummary: reject, list: reject, get: reject, issueRecoveryLink: reject, recordRecoveryAttempt: reject, markRecovered: reject, archive: reject } as AbandonedCartRepository;
}

test("approved staging access resolves only a frozen abandoned-cart facade", () => {
  const approved = access();
  registerServerAbandonedCartRepository(approved, repository());
  const runtime = resolveServerAbandonedCartRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.abandonedCarts).sort(), ["archive", "get", "getSummary", "issueRecoveryLink", "list", "markRecovered", "recordRecoveryAttempt"]);
  for (const forbidden of ["pool", "database", "connectionString", "options"]) assert.equal(forbidden in runtime.abandonedCarts, false);
});

test("disabled, malformed, and duplicate registrations fail closed", () => {
  assert.equal(resolveServerAbandonedCartRuntime(access("disabled")), null);
  assert.throws(() => registerServerAbandonedCartRepository(access("disabled"), repository()), /server_abandoned_cart_runtime_invalid/);
  const approved = access();
  assert.throws(() => registerServerAbandonedCartRepository(approved, {} as AbandonedCartRepository), /server_abandoned_cart_runtime_invalid/);
  registerServerAbandonedCartRepository(approved, repository());
  assert.throws(() => registerServerAbandonedCartRepository(approved, repository()), /server_abandoned_cart_runtime_invalid/);
});

test("approved staging composition shares one pool and preflights the complete abandoned-cart repository", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/g) ?? []).length, 1);
  assert.match(source, /new PostgresAbandonedCartRepository\([\s\S]*?pool,/);
  assert.match(source, /registerServerAbandonedCartRepository\(access, abandonedCartRepository\)/);
  for (const name of [
    "abandoned_carts_summary",
    "abandoned_carts_list",
    "abandoned_carts_get",
    "abandoned_carts_mark_recovered",
    "abandoned_carts_archive",
    "abandoned_carts_recover_operation",
    "commerce_cart_recovery_link_issue",
    "commerce_cart_recovery_attempt_record",
    "public_cart_mutate_without_customer_identity_v103",
    "abandoned_carts_projection",
    "customer_id",
    "firstProductName",
    "customerId",
  ]) assert.match(source, new RegExp(name));
});
