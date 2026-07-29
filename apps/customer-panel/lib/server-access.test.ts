import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the guarded server-access bridge consumes only the durable decision", () => {
  const source = readFileSync(new URL("./server-access.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only";/);
  assert.match(source, /decideServerPanelAccess\(await resolveServerPanelSession\(\)\)/);
  assert.match(source, /redirect\(decision\.destination\)/);
  assert.doesNotMatch(source, /DisabledPanelAuthorizationDataPort|resolvePanelTenantContext|InMemoryPanelSessionStore/);
});
