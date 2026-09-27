import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const base = new URL("./", import.meta.url);
const source = (suffix: string) => {
  const file = new URL(`202609270166_platform_starter_storefront.${suffix}.sql`, base);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};

test("166 bridges only exact supported platform hosts on future domain inserts", () => {
  const up = source("up");
  for (const suffix of [".saas-staging.celebix.net", ".saas-staging.celebix.site", ".celebix.site"]) {
    assert.ok(up.includes(`selected_store.slug||'${suffix}'`), suffix);
  }
  assert.match(up, /legacy_domain\.domain_type<>'platform_subdomain'/);
  assert.match(up, /legacy_domain\.status<>'active'/);
  assert.match(up, /NOT legacy_domain\.canonical/);
  assert.match(up, /selected_store\.status<>'active'/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.provision_celebix_net_starter_storefront\(p_domain_id uuid\)/);
  assert.doesNotMatch(up, /DO \$backfill\$|UPDATE saas\.(store_domains|storefront_designs)|DELETE FROM saas\.(domains|store_domains|storefront_designs)/);
});

test("166 validates safe disabled defaults for draft and publication without overwriting merchants", () => {
  const up = source("up");
  assert.match(up, /'enabled',false/);
  assert.match(up, /ARRAY\['announcement'\]/);
  assert.match(up, /storefront_design_text_valid\(pg_catalog\.to_jsonb\(selected_store\.name\),1,120\)/);
  assert.match(up, /storefront_design_document_valid\(selected_store\.id,seeded_design,false\)/);
  assert.match(up, /storefront_design_publishable\(selected_store\.id,seeded_design\)/);
  assert.match(up, /ON CONFLICT\(store_id\) DO NOTHING/);
  assert.match(up, /PLATFORM_STARTER_STOREFRONT_CONFLICT/);
  assert.match(up, /WHERE id=legacy_domain\.store_id FOR UPDATE/);
});

test("166 restores exact prior definitions and ACLs while preserving all created data", () => {
  const up = source("up");
  const down = source("down");
  assert.match(up, /pg_get_functiondef/);
  assert.match(up, /pg_get_triggerdef/);
  assert.match(up, /proacl/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(down, /EXECUTE selected\.definition/);
  assert.match(down, /PLATFORM_STARTER_DOWN_DEFINITION_CHANGED/);
  assert.doesNotMatch(down, /DELETE FROM|UPDATE saas\.(domains|store_domains|storefront_designs)/);
  for (const sql of [up, down]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
  }
});

test("166 records function identity independently of session search_path", () => {
  assert.match(source("up"), /procedure\.oid=pg_catalog\.to_regprocedure\(backup\.identity\)/);
  assert.doesNotMatch(source("up"), /backup\.identity=procedure\.oid::regprocedure::text/);
  assert.match(source("up"), /SET LOCAL search_path=pg_catalog,saas;/);
  assert.match(source("down"), /SET LOCAL search_path=pg_catalog,saas;/);
  assert.match(readFileSync(new URL("202609270166_platform_starter_storefront_assertions.sql", base), "utf8"), /SET LOCAL search_path=pg_catalog,saas;/);
});
