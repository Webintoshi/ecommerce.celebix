import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active-store route delegates only to the default durable session-control handler", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /handleDefaultPanelActiveStore/);
  assert.match(source, /export\s+const\s+POST\s*=\s*handleDefaultPanelActiveStore/);
  assert.doesNotMatch(source, /rejectInvalidPanelMutation|Response\.json|process\.env|pg\b|postgres|SELECT|credential|authorization/i);
});
