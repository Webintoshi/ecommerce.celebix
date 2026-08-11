import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("fixed policy console owns no create delete archive or tenant authority", () => {
  const source = readFileSync(new URL("./PolicyConsole.tsx", import.meta.url), "utf8");
  assert.match(source, /FIXED_STOREFRONT_POLICIES/);
  assert.match(source, /Markdown önizleme/);
  assert.match(source, /maxLength=\{100_000\}/);
  assert.match(source, /Taslak/);
  assert.match(source, /Yayında/);
  assert.match(source, /Yayındaki metinler/);
  assert.match(source, /Taslak metinler/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /aria-checked=/);
  assert.match(source, /policy-workspace/);
  assert.doesNotMatch(source, /Yeni politika|storePolicyApi[.](?:archive|delete)|storeId|tenantContext|principalId|membershipId/);
});
