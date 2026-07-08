import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("legacy self-serve requests endpoint is fail-closed and cannot create application queue records", () => {
  assert.match(routeSource, /self_serve_legacy_request_endpoint_disabled/);
  assert.match(routeSource, /status: 410/);
  assert.doesNotMatch(routeSource, /createSelfServeOnboardingRequest/);
  assert.doesNotMatch(routeSource, /basvuru/i);
  assert.doesNotMatch(routeSource, /başvuru/i);
});
