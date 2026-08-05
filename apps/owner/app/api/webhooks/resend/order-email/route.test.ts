import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public order email webhook route delegates the raw request and disables caching", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /getDefaultOrderEmailWebhookHandler/u);
  assert.match(source, /return handler\(request\)/u);
  assert.doesNotMatch(source, /request[.]json\(/u);
  assert.match(source, /force-dynamic/u);
});

