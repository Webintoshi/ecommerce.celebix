import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerSelfServeAuthRouteMountApproval } from "../../../apps/owner/lib/self-serve-auth-route-mount/activation.ts";
import { createApprovedStagingOwnerSelfServeAuthRouteSet } from "../../../apps/owner/lib/self-serve-auth-route-mount/route-set.ts";
import { createCustomerPanelAuthRouteMountApproval } from "../../../apps/customer-panel/lib/panel-auth-route-mount/activation.ts";
import { createApprovedStagingCustomerPanelAuthRouteSet } from "../../../apps/customer-panel/lib/panel-auth-route-mount/route-set.ts";
import {
  BOOTSTRAP,
  CALLBACK,
  REGISTER,
  SESSION_CREDENTIAL,
  composeApprovedStagingFlow,
  cookieValue,
  decodeBridgeForm,
} from "./flow-fixture.mjs";

test("approved-staging route adapters drive the genuine browser-bound flow without retry or external network", async () => {
  const flow = composeApprovedStagingFlow();
  const owner = createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: createOwnerSelfServeAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: flow.owner,
  });
  const customer = createApprovedStagingCustomerPanelAuthRouteSet({
    approval: createCustomerPanelAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: flow.customer,
  });
  flow.mountOwnerRoutes(owner);

  assert.throws(() => createApprovedStagingOwnerSelfServeAuthRouteSet({
    approval: createOwnerSelfServeAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: { ...flow.owner },
  }));
  assert.throws(() => createApprovedStagingCustomerPanelAuthRouteSet({
    approval: createCustomerPanelAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition: { ...flow.customer },
  }));

  const routeCalls = {
    publicRegistration: 0,
    browserBootstrap: 0,
    browserCallback: 0,
  };
  const invoke = async (name, handler, request) => {
    routeCalls[name] += 1;
    const exactRequest = request;
    const response = await handler(request);
    assert.equal(request, exactRequest);
    return response;
  };

  const registrationRequest = new Request(REGISTER, {
    method: "POST",
    headers: { origin: "https://ecommerce.celebix.co", "content-type": "application/json" },
    body: JSON.stringify({
      storeName: "Verified Store",
      storeSlug: "verified-store",
      marketingConsent: false,
      privacyConsent: true,
    }),
  });
  const registration = await invoke(
    "publicRegistration",
    owner.publicRegistration,
    registrationRequest,
  );
  assert.equal(registration.status, 200);
  assert.equal(registration.headers.has("location"), false);
  assert.equal(registration.headers.has("set-cookie"), false);
  const bridgeCsp = registration.headers.get("content-security-policy");
  assert.ok(bridgeCsp);
  assert.equal(
    bridgeCsp.split("; ").find((directive) => directive.startsWith("form-action ")),
    `form-action ${BOOTSTRAP} ${new URL(flow.browserAuthority.provider).origin}`,
  );
  assert.equal(bridgeCsp.includes(new URL(flow.browserAuthority.provider).search), false);
  assert.match(bridgeCsp, /(?:^|; )script-src 'nonce-[A-Za-z0-9_-]{32}'(?:;|$)/);
  assert.equal(bridgeCsp.includes("'self'"), false);
  assert.equal(bridgeCsp.includes("*"), false);
  assert.doesNotMatch(bridgeCsp, /(?:^|\s)https:(?:\s|;|$)/);
  assert.equal((bridgeCsp.match(/(?:^|; )form-action /g) ?? []).length, 1);
  const form = decodeBridgeForm(await registration.text());
  assert.equal(form.providerAuthorizationUrl, flow.browserAuthority.provider);
  assert.equal(form.bootstrapCredential, flow.browserAuthority.bootstrap);

  const bootstrapRequest = new Request(BOOTSTRAP, {
    method: "POST",
    headers: {
      origin: "https://ecommerce.celebix.co",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const bootstrap = await invoke("browserBootstrap", customer.browserBootstrap, bootstrapRequest);
  assert.equal(bootstrap.status, 303);
  assert.equal(bootstrap.headers.get("location"), form.providerAuthorizationUrl);
  const pb1 = cookieValue(bootstrap, "__Host-celebix_panel_pre_auth");
  assert.equal(pb1.startsWith("pb1."), true);

  const state = new URL(form.providerAuthorizationUrl).searchParams.get("state");
  assert.ok(state);
  const callbackUrl = `${CALLBACK}?state=${encodeURIComponent(state)}&code=verified-code`;
  const internalBeforeMissing = {
    binding: flow.counts.ownerBindingRoute,
    callback: flow.counts.ownerCallbackRoute,
    provider: flow.counts.provider,
    issuer: flow.counts.issuer,
    redeemer: flow.counts.redeemer,
  };
  const missing = await invoke(
    "browserCallback",
    customer.browserCallback,
    new Request(callbackUrl),
  );
  assert.equal(missing.status, 400);
  assert.equal(missing.headers.has("location"), false);
  assert.equal(missing.headers.has("set-cookie"), true);
  assert.deepEqual({
    binding: flow.counts.ownerBindingRoute,
    callback: flow.counts.ownerCallbackRoute,
    provider: flow.counts.provider,
    issuer: flow.counts.issuer,
    redeemer: flow.counts.redeemer,
  }, internalBeforeMissing);

  const callbackRequest = new Request(callbackUrl, {
    headers: { cookie: `__Host-celebix_panel_pre_auth=${pb1}` },
  });
  const completion = await invoke(
    "browserCallback",
    customer.browserCallback,
    callbackRequest,
  );
  assert.equal(completion.status, 303);
  assert.equal(completion.headers.get("location"), "https://panel.celebix.site/");
  assert.equal(cookieValue(completion, "__Host-celebix_panel"), SESSION_CREDENTIAL);
  assert.equal(
    completion.headers.getSetCookie().includes(
      "__Host-celebix_panel_pre_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    ),
    true,
  );

  assert.deepEqual(routeCalls, {
    publicRegistration: 1,
    browserBootstrap: 1,
    browserCallback: 2,
  });
  assert.equal(flow.counts.ownerBindingRoute, 1);
  assert.equal(flow.counts.ownerCallbackRoute, 1);
  assert.equal(flow.counts.gate, 2);
  assert.equal(flow.counts.registration, 1);
  assert.equal(flow.counts.bootstrapCreate, 1);
  assert.equal(flow.counts.bind, 1);
  assert.equal(flow.counts.claim, 1);
  assert.equal(flow.counts.provider, 1);
  assert.equal(flow.counts.issuer, 1);
  assert.equal(flow.counts.redeemer, 1);
  assert.equal(flow.counts.recovery, 0);
  assert.equal(flow.counts.sessions, 1);
  assert.equal(flow.counts.external, 0);
});
