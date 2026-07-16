import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("guarded panel access is server-only, cookie-only, and delegates to the durable resolver", () => {
  const directory = new URL("apps/customer-panel/lib/server-panel-access/", root);
  const sources = readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => read(`apps/customer-panel/lib/server-panel-access/${name}`));
  assert.ok(sources.length > 0);
  for (const source of sources) assert.match(source, /import "server-only";/);

  const joined = sources.join("\n");
  assert.match(joined, /createPostgresPanelSessionRepository/);
  assert.match(joined, /resolveSession/);
  assert.doesNotMatch(joined, /InMemoryPanelSessionStore|DisabledPanelSessionStore|DisabledPanelAuthorizationDataPort/);
  assert.doesNotMatch(joined, /localStorage|authorization|x-forwarded|forwarded|referer|origin|host/i);
  assert.doesNotMatch(joined, /FROM\s+saas\.(?:principals|stores|store_memberships|subscriptions|plans)/i);

  const serverSession = read("apps/customer-panel/lib/server-session.ts");
  assert.match(joined, /PANEL_SESSION_COOKIE_NAME/);
  assert.doesNotMatch(serverSession, /resolvePanelSession|DisabledPanelSessionStore|PANEL_LOCAL_TEST_SESSION_COOKIE_NAME/);
  const serverAccess = read("apps/customer-panel/lib/server-access.ts");
  assert.doesNotMatch(serverAccess, /DisabledPanelAuthorizationDataPort|resolvePanelTenantContext/);
  const layout = read("apps/customer-panel/app/(panel)/layout.tsx");
  assert.match(layout, /requireServerPanelAccess\(\)/);
});

test("database authority is absent from middleware, client components, and browser code", () => {
  for (const path of ["apps/customer-panel/middleware.ts", "apps/customer-panel/proxy.ts"]) {
    const url = new URL(path, root);
    if (existsSync(url)) assert.doesNotMatch(readFileSync(url, "utf8"), /\bpg\b|postgres|resolve_panel_session|server-panel-access/i);
  }
  const appRoot = new URL("apps/customer-panel/app/", root);
  const pending = [appRoot];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) pending.push(url);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        const source = readFileSync(url, "utf8");
        if (/^["']use client["'];/m.test(source)) {
          assert.doesNotMatch(source, /\bpg\b|postgres|resolve_panel_session|server-panel-access/i);
        }
      }
    }
  }
});

test("approved staging access reuses the existing customer-panel pool and timeout policy", () => {
  const established = read("apps/customer-panel/lib/panel-auth-route-runtime/runtime.ts");
  const access = read("apps/customer-panel/lib/server-panel-access/postgres-runtime.ts");
  for (const fragment of [
    "poolCheckoutMs: 2_000",
    "statementMs: 5_000",
    "lockMs: 5_000",
    "idleTransactionMs: 5_000",
    "max: 10",
    "idleTimeoutMillis: 10_000",
    "application_name: `celebix-panel-${config.activationId}`",
  ]) {
    assert.equal(established.includes(fragment), true, fragment);
    assert.equal(access.includes(fragment), true, fragment);
  }
  assert.match(access, /createPostgresPanelSessionRepository/);
  assert.match(access, /createPanelSessionPersistenceApproval\("approved_staging"\)/);
  assert.doesNotMatch(access, /FROM\s+saas\.(?:principals|stores|memberships|subscriptions|plans|plan_versions)/i);
});
