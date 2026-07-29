import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607290066_catalog_category_hierarchy.up.sql";
const DOWN = "202607290066_catalog_category_hierarchy.down.sql";
const VERIFY = "202607290066_catalog_category_hierarchy_assertions.sql";
const MANIFEST = "phase3y-catalog-category-hierarchy-manifest.json";
const BEGIN_SIGNATURE = /catalog_migration_begin\(\s*p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,\s*p_plan_version bigint,p_products_limit bigint,p_now timestamptz,\s*p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_source_digest text,\s*p_total_products integer,p_total_media integer,p_categories jsonb,p_brands jsonb\s*\)/;

test("migration 066 manifest has exact immutable SQL checksums and no external authority", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST), "utf8"));
  assert.deepEqual(
    {
      phase: manifest.phase,
      postgresqlMajor: manifest.postgresqlMajor,
      classification: manifest.classification,
      externalConnections: manifest.externalConnections,
      productionMutations: manifest.productionMutations,
    },
    {
      phase: "phase3y-catalog-category-hierarchy",
      postgresqlMajor: 16,
      classification: "additive-tenant-catalog-category-hierarchy-authority",
      externalConnections: 0,
      productionMutations: 0,
    },
  );
  assert.deepEqual(
    manifest.artifacts.map(({ file, direction }) => [file, direction]),
    [[UP, "up"], [DOWN, "down"], [VERIFY, "verify"]],
  );
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(path.join(SQL, artifact.file));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
    assert.doesNotMatch(source.toString("utf8"), /(?:guzidekuyumcu|celebix\.site|r2\.dev|amazonaws\.com|postgres(?:ql)?:\/\/|(?:customer|production)[_-]?host)/i);
  }
});

test("migration 066 stays transaction wrapped and exposes only the unchanged begin function", () => {
  const up = readFileSync(path.join(SQL, UP), "utf8");
  const down = readFileSync(path.join(SQL, DOWN), "utf8");
  const verify = readFileSync(path.join(SQL, VERIFY), "utf8");
  for (const source of [up, down, verify]) {
    assert.match(source, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /\bGRANT\b[^;]*\b(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i);
  }
  assert.match(up, BEGIN_SIGNATURE);
  assert.match(down, BEGIN_SIGNATURE);
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.catalog_migration_category_manifest_valid\(jsonb\) FROM PUBLIC/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.catalog_migration_category_manifest_matches\(uuid,jsonb\) FROM PUBLIC/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.catalog_migration_begin\(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb\) FROM PUBLIC,celebix_saas_app/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_begin\(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb\) TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_category_manifest_/);
});

test("migration 066 validates root-to-leaf topology, exact persisted parents, and exact rollback authority", () => {
  const up = readFileSync(path.join(SQL, UP), "utf8");
  const down = readFileSync(path.join(SQL, DOWN), "utf8");
  const verify = readFileSync(path.join(SQL, VERIFY), "utf8");
  assert.match(up, /CREATE FUNCTION saas\.catalog_migration_category_manifest_valid\(p_categories jsonb\)/);
  assert.match(up, /ARRAY\['id','name','slug'\],ARRAY\['parentSlug'\]/);
  assert.match(up, /selected_depth>8/);
  assert.match(up, /array_position\(known_slugs,selected_slug\) IS NOT NULL/);
  assert.match(up, /CREATE FUNCTION saas\.catalog_migration_category_manifest_matches\(p_store_id uuid,p_categories jsonb\)/);
  assert.match(up, /persisted_parent_slug IS DISTINCT FROM candidate->>'parentSlug'/);
  assert.match(up, /existing_category\.parent_id IS DISTINCT FROM requested_parent_id/);
  assert.match(up, /catalog_migration_category_manifest_matches\(p_store_id,p_categories\)/);
  assert.match(down, /DROP FUNCTION saas\.catalog_migration_category_manifest_matches\(uuid,jsonb\)/);
  assert.match(down, /DROP FUNCTION saas\.catalog_migration_category_manifest_valid\(jsonb\)/);
  assert.doesNotMatch(down, /\b(?:DELETE|TRUNCATE|DROP TABLE|ALTER TABLE)\b/i);
  assert.match(verify, /pg_catalog\.pg_get_functiondef/);
  assert.match(verify, /procedure\.prosecdef/);
  assert.match(verify, /procedure\.provolatile/);
  assert.match(verify, /pg_catalog\.pg_get_userbyid\(procedure\.proowner\)/);
  assert.match(verify, /parentSlug/);
  assert.match(verify, /parent_id IS DISTINCT FROM requested_parent_id/);
});
