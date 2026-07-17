import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("default catalog runtime reuses only the process-wide server-panel access runtime", () => {
  const source = readFileSync(new URL("./default.ts", import.meta.url), "utf8");
  assert.match(source, /resolveDefaultServerPanelAccessRuntime/);
  assert.match(source, /resolveServerCatalogRuntime/);
  assert.match(source, /export async function resolveDefaultServerCatalogRuntime/);
  assert.doesNotMatch(source, /\bpg\b|new Pool|process\.env|connectionString|DATABASE_URL/i);
});
