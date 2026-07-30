import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("logout route delegates only to the tenant-global Logto logout handler", () => {
  const route = new URL("./route.ts", import.meta.url);
  assert.equal(existsSync(route), true);
  const source = readFileSync(route, "utf8");
  assert.match(source, /handleDefaultTenantPanelSessionLogout/);
  assert.match(source, /export\s+const\s+POST\s*=\s*handleDefaultTenantPanelSessionLogout/);
  assert.doesNotMatch(source, /revokeSessionFamily|Response\.json|process\.env|pg\b|postgres|SELECT|credential|authorization/i);
});
