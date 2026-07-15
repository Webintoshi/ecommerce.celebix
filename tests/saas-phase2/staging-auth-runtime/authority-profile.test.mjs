import assert from "node:assert/strict";
import test from "node:test";

import {
  PANEL_BROWSER_BOOTSTRAP_URL,
  PANEL_HOME_URL,
  PANEL_OIDC_CALLBACK_URL,
  assertSaaSAuthAuthorityProfile,
  createApprovedStagingSaaSAuthAuthorityProfile,
} from "../../../packages/platform-config/src/saas.ts";

const VALID = Object.freeze({
  ownerOrigin: "https://owner-auth.staging.example.test",
  panelOrigin: "https://panel-auth.staging.example.test",
  platformDomainSuffix: "shops.staging.example.test",
});

test("production SaaS auth constants remain unchanged", () => {
  assert.equal(PANEL_OIDC_CALLBACK_URL, "https://panel.celebix.site/auth/callback");
  assert.equal(PANEL_BROWSER_BOOTSTRAP_URL, "https://panel.celebix.site/auth/bootstrap");
  assert.equal(PANEL_HOME_URL, "https://panel.celebix.site/");
});

test("approved staging authority profile is exact, derived, and deeply frozen", () => {
  const profile = createApprovedStagingSaaSAuthAuthorityProfile(VALID);
  assert.deepEqual(profile, {
    ownerOrigin: VALID.ownerOrigin,
    panelOrigin: VALID.panelOrigin,
    panelCallbackUrl: `${VALID.panelOrigin}/auth/callback`,
    panelBootstrapUrl: `${VALID.panelOrigin}/auth/bootstrap`,
    panelHomeUrl: `${VALID.panelOrigin}/`,
    ownerInternalBrowserBindingUrl: `${VALID.ownerOrigin}/api/internal/self-serve/browser-binding`,
    ownerInternalCallbackUrl: `${VALID.ownerOrigin}/api/internal/self-serve/oidc-callback`,
    platformDomainSuffix: VALID.platformDomainSuffix,
  });
  assert.deepEqual(Object.keys(profile), [
    "ownerOrigin", "panelOrigin", "panelCallbackUrl", "panelBootstrapUrl", "panelHomeUrl",
    "ownerInternalBrowserBindingUrl", "ownerInternalCallbackUrl", "platformDomainSuffix",
  ]);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isSealed(profile), true);
  assert.doesNotThrow(() => assertSaaSAuthAuthorityProfile(profile));
});

test("authority proof rejects a structurally identical frozen forgery", () => {
  const approved = createApprovedStagingSaaSAuthAuthorityProfile(VALID);
  assert.throws(
    () => assertSaaSAuthAuthorityProfile(Object.freeze({ ...approved })),
    /saas_auth_authority_profile_invalid/,
  );
});

test("staging authority profile rejects production and non-exact authorities", () => {
  for (const input of [
    { ...VALID, ownerOrigin: "https://ecommerce.celebix.co" },
    { ...VALID, panelOrigin: "https://panel.celebix.site" },
    { ...VALID, platformDomainSuffix: "celebix.site" },
    { ...VALID, panelOrigin: VALID.ownerOrigin },
    { ...VALID, ownerOrigin: `${VALID.ownerOrigin}/path` },
    { ...VALID, ownerOrigin: `https://user@owner-auth.staging.example.test` },
    { ...VALID, panelOrigin: `${VALID.panelOrigin}?query=1` },
    { ...VALID, platformDomainSuffix: "UPPER.staging.example.test" },
    { ...VALID, unexpected: "forbidden" },
  ]) {
    assert.throws(
      () => createApprovedStagingSaaSAuthAuthorityProfile(input),
      /saas_auth_staging_authority_invalid/,
    );
  }
});
