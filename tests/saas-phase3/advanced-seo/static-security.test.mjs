import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202607220040_advanced_seo_preferences.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202607220040_advanced_seo_preferences.down.sql"), "utf8");
const assertions = readFileSync(path.join(SQL, "202607220040_advanced_seo_preferences_assertions.sql"), "utf8");
const kinds = ["seo_geo_profile", "seo_internal_link", "seo_content_entry", "seo_category_entry", "seo_page_entry", "seo_product_entry", "ai_setting"];

test("advanced SEO manifest pins migration 040 exactly", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"));
  assert.equal(manifest.artifacts.length, 9);
  const files = ["202607220040_advanced_seo_preferences.up.sql", "202607220040_advanced_seo_preferences.down.sql", "202607220040_advanced_seo_preferences_assertions.sql"];
  for (const file of files) {
    const artifact = manifest.artifacts.find((entry) => entry.file === file);
    assert.ok(artifact, file);
    assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"), artifact.sha256, file);
  }
});

test("SEO and AI kinds have finite keys and exact authority mappings", () => {
  for (const kind of kinds) assert.match(up, new RegExp(`'${kind}'`));
  for (const kind of kinds.slice(0, -1)) assert.match(up, new RegExp(`WHEN p_kind IN\\([^)]*'${kind}'[^)]*\\) THEN CASE WHEN p_mutation THEN 'integrations\\.manage' ELSE 'integrations\\.read' END`, "s"));
  assert.match(up, /WHEN p_kind='ai_setting' THEN CASE WHEN p_mutation THEN 'configuration\.manage' ELSE 'configuration\.read' END/);
  for (const key of ["businessName", "businessCategory", "serviceAreas", "sourcePath", "targetPath", "anchorText", "resourceId", "metaTitle", "metaDescription", "canonicalPath", "structuredDataType", "tone", "locale", "enabledFeatures"]) assert.match(up, new RegExp(`'${key}'`));
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_setting_public_path/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_setting_uuid/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_setting_locale/);
  assert.ok(up.includes("'^/[A-Za-z0-9/_-]*$'"));
  assert.match(up, /'Article','FAQPage','Product','WebPage'/);
  assert.match(up, /'description_suggestions','seo_suggestions','campaign_drafts'/);
});

test("security boundaries preserve operation-first locking, exact ACLs, and canonical payload rejection", () => {
  assert.match(up, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('saas\.merchant\.admin\.operation:'/);
  assert.match(up, /merchant_admin_authority_error\([^;]+r\.record_kind,true\)/);
  assert.match(up, /octet_length\(p_config::text\)<=16384/);
  assert.match(up, /merchant_admin_setting_text/);
  assert.match(assertions, /pg_catalog\.aclexplode/);
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]*merchant_admin_setting_public_path/);
  assert.match(up, /FROM PUBLIC,celebix_saas_identity,celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT (?:ALL|EXECUTE).*TO PUBLIC/);
  for (const kind of kinds) assert.match(down, new RegExp(`DELETE FROM saas\\.merchant_admin_(?:operations|events|records)[\\s\\S]*'${kind}'`, "s"));
  assert.match(down, /DELETE FROM saas\.merchant_admin_operations/);
  assert.match(down, /DROP FUNCTION saas\.merchant_admin_setting_public_path/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid/);
  assert.doesNotMatch(down, /DROP TABLE saas\.merchant_admin_records/);
});
