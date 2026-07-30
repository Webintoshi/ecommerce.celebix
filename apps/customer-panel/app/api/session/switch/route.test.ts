import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("store switch route exposes only the durable cross-host POST handler", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /export const POST = handleDefaultPanelStoreSwitch/);
  assert.doesNotMatch(source, /export const (?:GET|PUT|PATCH|DELETE)/);
});
