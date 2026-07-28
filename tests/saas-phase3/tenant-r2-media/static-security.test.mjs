import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3-tenant-r2-media-manifest.json"), "utf8"));

test("tenant R2 media migration artifacts are exact and credential-free", () => {
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(path.join(SQL, artifact.file));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
    assert.doesNotMatch(source.toString("utf8"), /(?:access[_-]?key|secret[_-]?key|account[_-]?id|r2\.dev)/i);
  }
});

test("namespace authority is server-derived and forbidden roles receive no direct writes", () => {
  const up = readFileSync(path.join(SQL, "202607280058_store_media_namespace_exports.up.sql"), "utf8");
  assert.match(up, /namespace_prefix = 'stores\/' \|\| store_id::text \|\| '\/'/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /GRANT SELECT,INSERT ON TABLE saas\.store_media_namespaces TO celebix_saas_bootstrap/);
  assert.doesNotMatch(up, /\bGRANT\b[^;]*\b(?:INSERT|UPDATE|DELETE)\b[^;]*\bcelebix_saas_(?:app|identity|workflow|host_resolver)\b/i);
});

test("product archive is fenced by a durable one-way operation and legacy app authority is revoked", () => {
  const up = readFileSync(path.join(SQL, "202607280058_store_media_namespace_exports.up.sql"), "utf8");
  assert.match(up, /CREATE TABLE saas\.product_media_archive_operations/);
  assert.match(up, /CREATE UNIQUE INDEX product_media_archive_operations_one_reserved/);
  assert.match(up, /CREATE TRIGGER product_media_archive_reservation_fence/);
  assert.match(up, /CREATE FUNCTION saas\.media_reserve_product_archive/);
  assert.match(up, /CREATE FUNCTION saas\.media_finalize_product_archive/);
  assert.match(up, /CREATE FUNCTION saas\.media_recover_product_archive/);
  assert.match(up, /REVOKE EXECUTE ON FUNCTION saas\.media_archive_product[\s\S]*FROM celebix_saas_app;/);
});
