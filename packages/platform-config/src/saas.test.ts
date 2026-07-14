import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./saas.ts", import.meta.url), "utf8");

test("exports the fixed Phase 2B2B2A protocol constants", () => {
  assert.match(source, /PANEL_HOME_URL = "https:\/\/panel\.celebix\.site\/"/);
  assert.match(source, /PANEL_SESSION_COMPLETION_SCHEMA_VERSION = 1/);
  assert.match(source, /PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES = 4_096/);
  assert.match(source, /PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN = "celebix-session-handoff-response-v1"/);
});
