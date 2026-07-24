import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (name) => readFileSync(path.join(SQL, name), "utf8");
const upName = "202607230047_pricing_preview.up.sql";
const downName = "202607230047_pricing_preview.down.sql";
const assertionsName = "202607230047_pricing_preview_assertions.sql";

test("047 adds one stable execute-only server pricing preview authority", () => {
  const up = read(upName);
  assert.match(up, /CREATE FUNCTION saas[.]pricing_preview/);
  assert.match(up, /LANGUAGE plpgsql STABLE SECURITY DEFINER/);
  assert.match(up, /SET search_path=pg_catalog,saas/);
  assert.match(up, /merchant_action_authority_error[\s\S]*'catalog','pricing[.]read'/);
  assert.match(up, /resolve_effective_variant_price\([\s\S]*NULL::text/);
  assert.match(up, /ORDER BY[\s\S]*variant_id/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT EXECUTE[\s\S]*TO (?:PUBLIC|celebix_saas_workflow|celebix_saas_host_resolver)/);
  assert.doesNotMatch(up, /CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE saas[.]|DELETE FROM/);
});

test("047 validates dense finite anonymous preview input and emits no private data", () => {
  const up = read(upName);
  for (const proof of [
    /array_ndims\(p_variant_ids\)/,
    /array_lower\(p_variant_ids,1\)/,
    /cardinality\(p_variant_ids\) NOT BETWEEN 1 AND 100/,
    /array_position\(p_variant_ids,NULL\)/,
    /count\(DISTINCT variant_id\)/,
    /p_channel NOT IN\('storefront','quick_order'\)/,
    /NOT pg_catalog[.]isfinite\(p_now\)/,
  ]) assert.match(up, proof);
  assert.match(up, /'basePriceCents'/);
  assert.match(up, /'effectivePriceCents'/);
  assert.match(up, /'sourceKind'/);
  assert.match(up, /'priceListId'/);
  assert.match(up, /'asOf'/);
  assert.doesNotMatch(up, /'customerEmail'|'customerTagId'|'customerId'|'storeId'|'tenantId'/);
});

test("047 assertions and guarded down pin exact immutable authority", () => {
  const down = read(downName);
  const assertions = read(assertionsName);
  assert.match(down, /PRICING_PREVIEW_ROLLBACK_DRIFT/);
  assert.match(down, /pg_get_functiondef/);
  assert.match(down, /expected_definition/);
  assert.match(down, /regexp_replace/);
  assert.match(down, /function_acl IS DISTINCT FROM/);
  assert.doesNotMatch(down, /definition NOT LIKE/);
  assert.match(down, /DROP FUNCTION saas[.]pricing_preview/);
  assert.match(assertions, /provolatile='s'/);
  assert.match(assertions, /prosecdef/);
  assert.match(assertions, /celebix_saas_app/);
  assert.match(assertions, /aclexplode/);
  assert.match(assertions, /resolve_effective_variant_price/);
});

test("phase3h manifest pins all thirty-three artifacts including migration 048", () => {
  const manifest = JSON.parse(read("phase3h-merchant-completion-manifest.json"));
  assert.equal(manifest.artifacts.length, 33);
  for (const name of [upName, downName, assertionsName]) {
    const entry = manifest.artifacts.find((item) => item.file === name);
    assert.ok(entry, name);
    assert.equal(entry.sha256, createHash("sha256").update(read(name)).digest("hex"));
  }
});
