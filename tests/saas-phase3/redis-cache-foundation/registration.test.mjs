import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("current Phase 3 runner mandates the exact Redis cache rehearsal", async () => {
  const source = await readFile(new URL("../run-current-suite.mjs", import.meta.url), "utf8");
  assert.match(source, /tests\/saas-phase3\/redis-cache-foundation\/redis-harness[.]mjs/);
  assert.match(source, /PASS 10\\\/10 Redis cache foundation rehearsal complete/);
});
