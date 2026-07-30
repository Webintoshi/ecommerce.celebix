import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./StoreSwitcher.tsx", import.meta.url), "utf8");

test("store switcher is a normal top-level form with no credential-reading client path", () => {
  assert.match(source, /action="\/api\/session\/switch"/);
  assert.match(source, /method="post"/);
  assert.match(source, /name="destinationStoreId"/);
  assert.match(source, /stores\.length < 2/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|handoff/);
});
