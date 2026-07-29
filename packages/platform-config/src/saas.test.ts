import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./saas.ts", import.meta.url), "utf8");

test("exports the fixed Phase 2B2B2A protocol constants", () => {
  assert.match(source, /PANEL_HOME_URL = "https:\/\/panel\.celebix\.site\/"/);
  assert.match(source, /PANEL_SESSION_COMPLETION_SCHEMA_VERSION = 1/);
  assert.match(source, /PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION = 2/);
  assert.match(source, /PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES = 4_096/);
  assert.match(source, /PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN = "celebix-session-handoff-response-v1"/);
});

test("exports the fixed unmounted browser-binding authorities and isolated signature domains", () => {
  assert.match(source, /PANEL_BROWSER_BOOTSTRAP_URL = "https:\/\/panel\.celebix\.site\/auth\/bootstrap"/);
  assert.match(source, /PANEL_BROWSER_BINDING_INTERNAL_PATH = "\/api\/internal\/self-serve\/browser-binding"/);
  assert.match(source, /PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN = "celebix-panel-browser-bootstrap-request-v1"/);
  assert.match(source, /PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN = "celebix-panel-browser-bootstrap-response-v1"/);
});
