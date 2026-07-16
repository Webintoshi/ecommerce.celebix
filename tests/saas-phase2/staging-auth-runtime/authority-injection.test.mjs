import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerPanelBootstrapAutoPostResponse } from "../../../apps/owner/lib/self-serve-browser-bound-registration/auto-post-html.ts";
import {
  validateCustomerPanelCallbackAuthority,
  validateCustomerPanelCallbackUrl,
} from "../../../apps/customer-panel/lib/self-serve-callback-edge/callback-request.ts";

const PANEL = "https://panel-auth.staging.example.test";
const CALLBACK = `${PANEL}/auth/callback`;
const BOOTSTRAP = `${PANEL}/auth/bootstrap`;

test("auto-POST bridge binds form action and CSP to the injected immutable staging bootstrap authority", async () => {
  const providerAuthorizationUrl = `https://identity.staging.example.test/authorize?state=${"s".repeat(32)}`;
  const response = createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: `bs1.staging.${"a".repeat(43)}`,
    providerAuthorizationUrl,
    panelBootstrapAuthority: BOOTSTRAP,
    randomBytes: () => new Uint8Array(24).fill(7),
  });
  const html = await response.text();
  assert.match(html, new RegExp(`action="${BOOTSTRAP}"`));
  assert.equal(
    response.headers.get("content-security-policy")?.split("; ").find((directive) => directive.startsWith("form-action ")),
    `form-action ${BOOTSTRAP} https://identity.staging.example.test`,
  );
  assert.equal(response.headers.get("content-security-policy")?.includes(new URL(providerAuthorizationUrl).search), false);
  assert.equal(html.includes("panel.celebix.site"), false);
});

test("callback validator accepts only the injected exact HTTPS callback authority", () => {
  assert.equal(validateCustomerPanelCallbackAuthority(CALLBACK), CALLBACK);
  const callback = validateCustomerPanelCallbackUrl(
    `${CALLBACK}?state=${"s".repeat(32)}&code=once`,
    CALLBACK,
    8_192,
  );
  assert.equal(callback.kind, "success");
  for (const invalid of [
    `${PANEL}/auth/callback/`, `${PANEL}:443/auth/callback`,
    `https://user@panel-auth.staging.example.test/auth/callback`,
  ]) assert.throws(() => validateCustomerPanelCallbackAuthority(invalid));
});
