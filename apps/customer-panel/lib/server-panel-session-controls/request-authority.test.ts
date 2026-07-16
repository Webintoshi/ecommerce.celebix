import assert from "node:assert/strict";
import test from "node:test";

type AuthorityModule = typeof import("./request-authority.ts");

const authority = await import("./request-authority.ts").catch(
  () => ({} as Partial<AuthorityModule>),
);

const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const ACTIVE_STORE_PATH = "/api/session/active-store";

test("exports one immutable proxy-safe panel session-control authority validator", () => {
  assert.equal(typeof authority.createPanelSessionControlRequestAuthorityValidator, "function");
  const validator = authority.createPanelSessionControlRequestAuthorityValidator?.({
    panelOrigin: PANEL_ORIGIN,
    pathname: ACTIVE_STORE_PATH,
  });
  assert.equal(Object.isFrozen(validator), true);
  assert.equal(
    validator?.validate(new Request(`https://internal-panel:3400${ACTIVE_STORE_PATH}`, {
      method: "POST",
      headers: { origin: PANEL_ORIGIN },
    })),
    "approved",
  );
  assert.equal(
    validator?.validate(new Request(`http://customer-panel:3400${ACTIVE_STORE_PATH}`, {
      method: "POST",
      headers: { origin: PANEL_ORIGIN },
    })),
    "approved",
  );
});

test("rejects method, Origin, path, query, fragment, credentials, and malformed configuration", () => {
  const create = authority.createPanelSessionControlRequestAuthorityValidator;
  assert.equal(typeof create, "function");
  const validator = create?.({ panelOrigin: PANEL_ORIGIN, pathname: ACTIVE_STORE_PATH });
  const request = (url: string, init: RequestInit = {}) => new Request(url, {
    method: "POST",
    headers: { origin: PANEL_ORIGIN, ...(init.headers ?? {}) },
    ...init,
  });
  assert.equal(validator?.validate(request(`https://internal${ACTIVE_STORE_PATH}`, { method: "GET" })), "method_not_allowed");
  assert.equal(validator?.validate(request(`https://internal${ACTIVE_STORE_PATH}`, { headers: {} })), "origin_denied");
  assert.equal(validator?.validate(request(`https://internal${ACTIVE_STORE_PATH}`, { headers: { origin: `${PANEL_ORIGIN}/` } })), "origin_denied");
  for (const url of [
    "https://internal/api/session/logout",
    `https://internal${ACTIVE_STORE_PATH}/child`,
    `https://internal${ACTIVE_STORE_PATH}?store=forged`,
    `https://internal${ACTIVE_STORE_PATH}#fragment`,
  ]) assert.equal(validator?.validate(request(url)), "request_invalid", url);
  assert.equal(
    validator?.validate(request("https://internal/wrong", {
      headers: {
        origin: "https://wrong.example.test",
        forwarded: `host=panel.saas-staging.celebix.site;proto=https`,
        "x-forwarded-host": "panel.saas-staging.celebix.site",
        "x-forwarded-proto": "https",
      },
    })),
    "origin_denied",
  );
  for (const panelOrigin of [
    "http://panel.saas-staging.celebix.site",
    `${PANEL_ORIGIN}/`,
    "https://user:password@panel.saas-staging.celebix.site",
    "https://panel.saas-staging.celebix.site:443",
  ]) assert.throws(() => create?.({ panelOrigin, pathname: ACTIVE_STORE_PATH }), /panel_session_control_request_authority_invalid/);
});
