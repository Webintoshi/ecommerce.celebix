import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("newsletter form exposes explicit consent, stable status, and no tenant authority", async () => {
  const source = await readFile(new URL("./NewsletterForm.tsx", import.meta.url), "utf8");
  assert.match(source, /type="email"/u);
  assert.match(source, /type="checkbox"/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /\/api\/newsletter\/subscriptions/u);
  assert.doesNotMatch(source, /tenantId|storeId|localStorage|sessionStorage/u);
});
