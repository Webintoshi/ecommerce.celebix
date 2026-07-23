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

test("typed settings retain finite kinds, action mapping, and one exact app ACL", () => {
  for (const kind of ["notification_setting", "hero_banner", "promotion_banner", "marquee_setting"]) {
    assert.match(up, new RegExp(`'${kind}'`));
    assert.match(up, new RegExp(`WHEN p_kind IN\\([^)]*'${kind}'[^)]*\\) THEN CASE WHEN p_mutation THEN 'configuration\\.manage' ELSE 'configuration\\.read' END`, "s"));
  }
  assert.match(up, /ALTER TABLE saas\.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid\(p_kind text,p_config jsonb\)/);
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]*merchant_admin_save/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*merchant_admin_recover_operation[\s\S]*TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT (?:ALL|EXECUTE).*TO PUBLIC/);
});

test("settings validate closed public payloads and down restores exact prior authority", () => {
  for (const key of ["emailEnabled", "smsEnabled", "pushEnabled", "senderLabel", "replyToEmail", "headline", "body", "imageUrl", "destination", "startsAt", "endsAt", "items", "icon", "speed", "direction", "animation", "enabled"]) assert.match(up, new RegExp(`'${key}'`));
  assert.match(up, /merchant_admin_setting_text/);
  assert.match(up, /merchant_admin_setting_timestamp/);
  assert.match(up, /smtpPassword|apiKey|pushToken|html/i);
  for (const kind of ["notification_setting", "hero_banner", "promotion_banner", "marquee_setting"]) assert.doesNotMatch(down, new RegExp(`'${kind}'`));
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_required_action/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid/);
  assert.doesNotMatch(down, /DROP TABLE saas\.merchant_admin_records/);
});
