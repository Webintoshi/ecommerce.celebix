import assert from "node:assert/strict";
import test from "node:test";

import {
  createOwnerSelfServeAuthRouteMountApproval,
} from "../../../apps/owner/lib/self-serve-auth-route-mount/activation.ts";
import {
  createCustomerPanelAuthRouteMountApproval,
} from "../../../apps/customer-panel/lib/panel-auth-route-mount/activation.ts";
import * as ownerRouteSets from "../../../apps/owner/lib/self-serve-auth-route-mount/route-set.ts";
import * as customerRouteSets from "../../../apps/customer-panel/lib/panel-auth-route-mount/route-set.ts";
import { composeApprovedStagingFlow } from "./flow-fixture.mjs";

const REGISTRATION_FALLBACK_CSP =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";

test("approved-staging route sets require genuine approvals and genuine compositions", () => {
  assert.equal(typeof ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet, "function");
  assert.equal(typeof customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet, "function");
  const flow = composeApprovedStagingFlow();
  const ownerApproval = createOwnerSelfServeAuthRouteMountApproval("approved_staging");
  const customerApproval = createCustomerPanelAuthRouteMountApproval("approved_staging");

  const owner = ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: ownerApproval,
    environment: "approved_staging",
    composition: flow.owner,
  });
  const customer = customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet({
    approval: customerApproval,
    environment: "approved_staging",
    composition: flow.customer,
  });

  assert.deepEqual(Object.keys(owner), [
    "publicRegistration", "internalBrowserBinding", "internalCallback", "readiness",
  ]);
  assert.deepEqual(Object.keys(customer), ["browserBootstrap", "browserCallback", "readiness"]);
  assert.equal(owner.readiness.mode, "approved_staging_injected");
  assert.equal(customer.readiness.mode, "approved_staging_injected");
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(customer), true);
  assert.doesNotThrow(() => ownerRouteSets.assertOwnerSelfServeAuthRouteSet(owner));
  assert.doesNotThrow(() => customerRouteSets.assertCustomerPanelAuthRouteSet(customer));

  for (const invalid of [
    { ...owner },
    JSON.parse(JSON.stringify(owner.readiness)),
    structuredClone(owner.readiness),
  ]) assert.throws(() => ownerRouteSets.assertOwnerSelfServeAuthRouteSet(invalid));
  for (const invalid of [
    { ...customer },
    JSON.parse(JSON.stringify(customer.readiness)),
    structuredClone(customer.readiness),
  ]) assert.throws(() => customerRouteSets.assertCustomerPanelAuthRouteSet(invalid));

  assert.throws(() => ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: { ...ownerApproval },
    environment: "approved_staging",
    composition: flow.owner,
  }), /owner_self_serve_auth_route_mount_approval_invalid/);
  assert.throws(() => customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet({
    approval: { ...customerApproval },
    environment: "approved_staging",
    composition: flow.customer,
  }), /customer_panel_auth_route_mount_approval_invalid/);
  assert.throws(() => ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: ownerApproval,
    environment: "production",
    composition: flow.owner,
  }), /owner_self_serve_auth_route_set_invalid/);
  assert.throws(() => customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet({
    approval: customerApproval,
    environment: "disposable_test",
    composition: flow.customer,
  }), /customer_panel_auth_route_set_invalid/);
  assert.throws(() => ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: ownerApproval,
    environment: "approved_staging",
    composition: { ...flow.owner },
  }), /owner_self_serve_auth_composition_invalid/);
  assert.throws(() => customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet({
    approval: customerApproval,
    environment: "approved_staging",
    composition: { ...flow.customer },
  }), /customer_panel_auth_composition_invalid/);
});

test("approved-staging route-set boundary returns handler responses and controls thrown errors", async () => {
  assert.equal(typeof ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet, "function");
  assert.equal(typeof customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet, "function");
  const flow = composeApprovedStagingFlow();
  const owner = ownerRouteSets.createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: createOwnerSelfServeAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: flow.owner,
  });
  const customer = customerRouteSets.createApprovedStagingCustomerPanelAuthRouteSet({
    approval: createCustomerPanelAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: flow.customer,
  });

  const ownerResponse = await owner.publicRegistration(new Request(
    "https://ecommerce.celebix.co/api/self-serve/register",
  ));
  assert.equal(ownerResponse.status, 405);
  assert.equal((await ownerResponse.json()).code, "self_serve_register_read_disabled");
  const customerResponse = await customer.browserBootstrap(new Request(
    "https://panel.celebix.site/auth/bootstrap",
  ));
  assert.equal(customerResponse.status, 405);

  const OriginalResponse = globalThis.Response;
  let rejectConstruction = true;
  class RejectOnceResponse extends OriginalResponse {
    constructor(...args) {
      if (rejectConstruction) {
        rejectConstruction = false;
        throw new Error("private injected failure");
      }
      super(...args);
    }
    static json(...args) { return OriginalResponse.json(...args); }
  }
  let ownerFailure;
  globalThis.Response = RejectOnceResponse;
  try {
    ownerFailure = await owner.publicRegistration(new Request(
      "https://ecommerce.celebix.co/api/self-serve/register",
    ));
  } finally {
    globalThis.Response = OriginalResponse;
  }

  const customerRequest = new Request("https://panel.celebix.site/auth/bootstrap");
  Object.defineProperty(customerRequest, "method", {
    get() { throw new Error("private injected failure"); },
  });
  const customerFailure = await customer.browserBootstrap(customerRequest);

  for (const [response, code] of [
    [ownerFailure, "owner_auth_route_unavailable"],
    [customerFailure, "panel_auth_route_unavailable"],
  ]) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code, retryable: false });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    if (response === ownerFailure) {
      assert.equal(response.headers.get("content-security-policy"), REGISTRATION_FALLBACK_CSP);
    }
  }
});
