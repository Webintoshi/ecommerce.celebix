import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");

test("starter theme manifest pins every forward and rollback artifact", () => {
  const manifest = JSON.parse(read("apps/owner/scripts/sql/saas/phase3y-admin-managed-starter-theme-manifest.json"));
  assert.equal(manifest.postgresqlMajor, 16);
  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    const digest = createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.file);
  }
});

test("starter theme projection remains hostname-first and server-owned", () => {
  const migration = read("apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.up.sql");
  assert.match(migration, /public_starter_presentation\(p_store_id uuid, p_now timestamptz, p_allow_index boolean\)/);
  assert.match(migration, /resolve_public_storefront\(p_hostname text, p_now timestamptz\)/);
  assert.match(migration, /ORDER BY r\.updated_at DESC, r\.id DESC/);
  assert.match(migration, /domain\.hostname_type='custom_domain' AND domain\.is_primary/);
  assert.match(migration, /COALESCE\(\(seo_config->>'allowIndex'\)::boolean,false\) AND p_allow_index/);
  assert.doesNotMatch(migration, /x-forwarded|cookie|searchParams|localStorage|sessionStorage/i);
});

test("host resolver receives no merchant table or helper authority", () => {
  const migration = read("apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.up.sql");
  assert.match(migration, /REVOKE ALL ON FUNCTION[^;]+saas\.public_starter_presentation\(uuid,timestamptz\)[^;]+FROM PUBLIC/s);
  assert.match(migration, /REVOKE ALL ON FUNCTION[^;]+saas\.public_starter_presentation\(uuid,timestamptz,boolean\)[^;]+FROM PUBLIC/s);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION saas\.resolve_public_storefront[^;]+TO celebix_saas_host_resolver/s);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]+merchant_admin_records[^;]+host_resolver/is);
});
