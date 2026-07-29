import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("session-control routes are narrow delegates without browser or database authority", () => {
  for (const path of [
    "apps/customer-panel/app/api/session/active-store/route.ts",
    "apps/customer-panel/app/api/session/logout/route.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /\bpg\b|postgres|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
    assert.doesNotMatch(source, /process\.env|authorization|cookie|forwarded|origin|host|console\./i);
    assert.match(source, /^import \{ handleDefaultPanel/m);
    assert.match(source, /export const POST = handleDefaultPanel/);
  }
});

test("one server-only control boundary enforces cookie, request, and current-session authority", () => {
  const directory = new URL("apps/customer-panel/lib/server-panel-session-controls/", root);
  const sources = readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => read(`apps/customer-panel/lib/server-panel-session-controls/${name}`));
  assert.ok(sources.length >= 5);
  for (const source of sources) assert.match(source, /import "server-only";/);
  const joined = sources.join("\n");
  assert.match(joined, /__Host-celebix_panel/);
  assert.match(joined, /request\.headers\.get\("origin"\) !== panelOrigin/);
  assert.match(joined, /rotateSession/);
  assert.match(joined, /recoverOperation/);
  assert.match(joined, /revokeSession/);
  assert.match(joined, /reason: "logout"/);
  assert.doesNotMatch(joined, /revokeSessionFamily|localStorage|document\.cookie|console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(joined, /new Pool|createPostgresPanelSessionRepository|FROM\s+saas\./i);
});

test("cookie projections are host-only and handlers reject private browser authority", () => {
  const cookie = read("apps/customer-panel/lib/panel-session-completion/cookie.ts");
  const handler = read("apps/customer-panel/lib/server-panel-session-controls/handler.ts");
  const runtime = read("apps/customer-panel/lib/server-panel-access/runtime.ts");
  const defaults = read("apps/customer-panel/lib/server-panel-access/default.ts");
  assert.match(cookie, /__Host-celebix_panel=/);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Path=\//);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.match(handler, /headers\.has\("authorization"\)/);
  assert.match(handler, /headers\.has\("x-celebix-session"\)/);
  assert.match(handler, /Response\.json\(\{ ok: true, activeStoreId: result\.activeStoreId \}/);
  assert.doesNotMatch(handler, /Response\.json\(\{[^}]*credential/s);
  assert.match(runtime, /createDisabledServerPanelAccessRuntime/);
  assert.match(runtime, /createUnavailableServerPanelAccessRuntime/);
  assert.match(defaults, /const resolver = createServerPanelAccessRuntimeResolver/);
  assert.equal((defaults.match(/createServerPanelAccessRuntimeResolver/g) ?? []).length, 2);
});
