import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202607220039_typed_storefront_settings.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202607220039_typed_storefront_settings.down.sql"), "utf8");

test("typed storefront settings manifest pins every migration artifact", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"));
  assert.equal(manifest.artifacts.length, 6);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256);
});

test("typed settings retain finite kinds, action mapping, and exact role ACLs", () => {
  for (const kind of ["notification_setting", "hero_banner", "promotion_banner", "marquee_setting"]) {
    assert.match(up, new RegExp(`'${kind}'`));
    assert.match(up, new RegExp(`WHEN p_kind IN\\([^)]*'${kind}'[^)]*\\) THEN CASE WHEN p_mutation THEN 'configuration\\.manage' ELSE 'configuration\\.read' END`, "s"));
  }
  assert.match(up, /ALTER TABLE saas\.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid\(p_kind text,p_config jsonb\)/);
  for (const signature of ["merchant_admin_list", "merchant_admin_list_events", "merchant_admin_save", "merchant_admin_archive", "merchant_admin_recover_operation"]) assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION[\\s\\S]*${signature}[\\s\\S]*TO celebix_saas_app`));
  for (const helper of ["merchant_admin_setting_text", "merchant_admin_setting_https_media_url", "merchant_admin_setting_destination", "merchant_admin_setting_email", "merchant_admin_setting_timestamp_value", "merchant_admin_setting_timestamp", "merchant_admin_required_action", "merchant_admin_config_valid"]) assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION[\\s\\S]*${helper}`));
  assert.doesNotMatch(up, /GRANT (?:ALL|EXECUTE).*TO PUBLIC/);
});

test("settings validate canonical UTF-8 public payloads and restore the exact 036 archive", () => {
  for (const key of ["emailEnabled", "smsEnabled", "pushEnabled", "senderLabel", "replyToEmail", "headline", "body", "imageUrl", "destination", "startsAt", "endsAt", "items", "icon", "speed", "direction", "animation", "enabled"]) assert.match(up, new RegExp(`'${key}'`));
  assert.match(up, /merchant_admin_setting_text/);
  assert.match(up, /merchant_admin_setting_timestamp/);
  assert.match(up, /octet_length\(p_config::text\)<=16384/);
  assert.match(up, /octet_length\(p_value#>>'\{\}'\) BETWEEN p_min AND p_max/);
  assert.match(up, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('saas\.merchant\.admin\.operation:'/);
  assert.doesNotMatch(up, /pg_column_size\(p_config\)/);
  for (const kind of ["notification_setting", "hero_banner", "promotion_banner", "marquee_setting"]) assert.doesNotMatch(down, new RegExp(`'${kind}'`));
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_required_action/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_archive/);
  assert.doesNotMatch(down, /pg_advisory_xact_lock/);
  assert.doesNotMatch(down, /DROP TABLE saas\.merchant_admin_records/);
});
