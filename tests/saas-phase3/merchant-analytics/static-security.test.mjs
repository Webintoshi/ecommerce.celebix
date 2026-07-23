import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202607220038_merchant_analytics.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202607220038_merchant_analytics.down.sql"), "utf8");

test("merchant analytics manifest pins every migration artifact", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"));
  assert.equal(manifest.artifacts.length, 21);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256);
});

test("analytics has one app-facing read function with exact closed ACL", () => {
  assert.match(up, /CREATE FUNCTION saas\.merchant_analytics_dashboard\(.*?RETURNS TABLE\(outcome text,result_payload jsonb\).*?SECURITY DEFINER SET search_path=pg_catalog,saas/s);
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.merchant_analytics_series.*?FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator/s);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.merchant_analytics_dashboard\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text\) TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION saas\.merchant_analytics_(?:series|top_products)/);
});

test("analytics uses closed authority, fixed periods, and store predicates", () => {
  assert.match(up, /'analytics','analytics\.read'/);
  assert.doesNotMatch(up, /analytics\.write/);
  assert.match(up, /p_period IS NULL OR p_period NOT IN \('today','week','month','year'\)/);
  assert.ok(up.indexOf("p_period IS NULL OR p_period NOT IN ('today','week','month','year')") < up.indexOf("e:=saas.merchant_action_authority_error"));
  assert.match(up, /item\.store_id=p_store_id AND item\.product_id IS NOT NULL AND ord\.store_id=p_store_id/);
  assert.match(up, /FROM saas\.orders WHERE store_id=p_store_id/);
  assert.match(up, /jsonb_build_object\('productId',product_id,'title',title,'quantity',quantity,'revenueCents',revenue_cents\)/);
  assert.match(up, /GROUP BY item\.product_id,item\.product_name/);
  assert.match(up, /ORDER BY revenue_cents DESC,quantity DESC,item\.product_id ASC,item\.product_name ASC/);
  assert.match(up, /SUM\(total_cents::numeric\)/);
  assert.match(up, /SUM\(item\.quantity::numeric\)/);
  assert.match(up, /SUM\(item\.line_total_cents::numeric\)/);
  assert.match(up, /p_end_at-interval '1 microsecond'/);
  assert.match(up, /COUNT\(\*\) FILTER\(WHERE status='active' AND created_at>=start_at/);
});

test("rollback removes analytics only and restores the prior finite action policy", () => {
  assert.match(down, /DROP FUNCTION saas\.merchant_analytics_dashboard/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_action_authority_error/);
  assert.doesNotMatch(down, /analytics\.read/);
  assert.doesNotMatch(down, /DROP TABLE saas\.(?:orders|customers|products)/);
});
