import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const OWNER_MODULE = resolve(
  ROOT,
  "apps/owner/lib/self-serve-auth-route-mount/activation.ts",
);
const CUSTOMER_MODULE = resolve(
  ROOT,
  "apps/customer-panel/lib/panel-auth-route-mount/activation.ts",
);

const APPROVAL = Object.freeze({
  phase: "2B2B2C1",
  environment: "approved_staging",
  routeMount: "injected_only",
  defaultMode: "disabled",
  productionActivation: "forbidden",
  secretLoading: "forbidden",
  providerNetworking: "forbidden",
  deployment: "forbidden",
});

test("Owner route-mount approval is exact, frozen, sealed, and unforgeable", async () => {
  assert.equal(existsSync(OWNER_MODULE), true, "Owner route-mount activation module must exist");
  const {
    assertOwnerSelfServeAuthRouteMountApproval,
    createOwnerSelfServeAuthRouteMountApproval,
  } = await import(OWNER_MODULE);

  const approval = createOwnerSelfServeAuthRouteMountApproval("approved_staging");
  assert.deepEqual(approval, APPROVAL);
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertOwnerSelfServeAuthRouteMountApproval(approval));

  for (const copy of [
    { ...approval },
    JSON.parse(JSON.stringify(approval)),
    structuredClone(approval),
    { ...APPROVAL },
  ]) {
    assert.throws(
      () => assertOwnerSelfServeAuthRouteMountApproval(copy),
      /owner_self_serve_auth_route_mount_approval_invalid/,
    );
  }
  for (const environment of ["production", "disposable_test", "staging", ""]) {
    assert.throws(
      () => createOwnerSelfServeAuthRouteMountApproval(environment),
      /owner_self_serve_auth_route_mount_approval_invalid/,
    );
  }
});

test("customer route-mount approval is exact, frozen, sealed, and unforgeable", async () => {
  assert.equal(existsSync(CUSTOMER_MODULE), true, "customer route-mount activation module must exist");
  const {
    assertCustomerPanelAuthRouteMountApproval,
    createCustomerPanelAuthRouteMountApproval,
  } = await import(CUSTOMER_MODULE);

  const approval = createCustomerPanelAuthRouteMountApproval("approved_staging");
  assert.deepEqual(approval, APPROVAL);
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertCustomerPanelAuthRouteMountApproval(approval));

  for (const copy of [
    { ...approval },
    JSON.parse(JSON.stringify(approval)),
    structuredClone(approval),
    { ...APPROVAL },
  ]) {
    assert.throws(
      () => assertCustomerPanelAuthRouteMountApproval(copy),
      /customer_panel_auth_route_mount_approval_invalid/,
    );
  }
  for (const environment of ["production", "disposable_test", "staging", ""]) {
    assert.throws(
      () => createCustomerPanelAuthRouteMountApproval(environment),
      /customer_panel_auth_route_mount_approval_invalid/,
    );
  }
});
