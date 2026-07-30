import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("logout callback route exposes only the fixed server-owned GET handler", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /export const GET = handleDefaultTenantPanelLogoutCallback/);
  assert.doesNotMatch(source, /export const (?:POST|PUT|PATCH|DELETE)/);
});
