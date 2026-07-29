import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP_066 = "202607290066_catalog_category_hierarchy.up.sql";
const DOWN_066 = "202607290066_catalog_category_hierarchy.down.sql";
const VERIFY_066 = "202607290066_catalog_category_hierarchy_assertions.sql";
const MANIFEST_066 = "phase3y-catalog-category-hierarchy-manifest.json";
const UP_067 = "202607290067_catalog_category_replay_binding.up.sql";
const DOWN_067 = "202607290067_catalog_category_replay_binding.down.sql";
const VERIFY_067 = "202607290067_catalog_category_replay_binding_assertions.sql";
const MANIFEST_067 = "phase3z-catalog-category-replay-binding-manifest.json";
const BEGIN_SIGNATURE = /catalog_migration_begin\(\s*p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,\s*p_plan_version bigint,p_products_limit bigint,p_now timestamptz,\s*p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_source_digest text,\s*p_total_products integer,p_total_media integer,p_categories jsonb,p_brands jsonb\s*\)/;
const BEGIN_EXECUTE_GRANT = "GRANT EXECUTE ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) TO celebix_saas_app;";
const BINDING_PREDICATE = `
       OR NOT EXISTS(
         SELECT 1
         FROM saas.catalog_product_migration_operations accepted_begin
         WHERE accepted_begin.store_id=p_store_id
           AND accepted_begin.job_id=existing_job.id
           AND accepted_begin.operation_kind='begin'
           AND accepted_begin.payload_fingerprint=p_fingerprint
       )`;

function beginDefinition(source) {
  const match = source.match(/CREATE OR REPLACE FUNCTION saas\.catalog_migration_begin\([\s\S]*?\nEND\n\$function\$;/);
  assert.ok(match, "catalog_migration_begin definition");
  return match[0];
}

function assertNoExternalOrTableAuthority(source, file) {
  assert.doesNotMatch(source, /(?:guzidekuyumcu|celebix\.site|r2\.dev|amazonaws\.com|postgres(?:ql)?:\/\/|(?:customer|production)[_-]?host)/i, file);
  assert.doesNotMatch(source, /\bGRANT\s+ALL(?:\s+PRIVILEGES)?\b/i, file);
  assert.doesNotMatch(source, /\bGRANT\b[^;]*\bON\s+(?:TABLE\b|ALL\s+TABLES\b)/i, file);
  assert.doesNotMatch(source, /\bGRANT\b[^;]*\b(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i, file);
}

test("migrations 066 and 067 have exact immutable SQL checksums and no external authority", () => {
  const manifests = [
    {
      file: MANIFEST_066,
      metadata: {
        phase: "phase3y-catalog-category-hierarchy",
        postgresqlMajor: 16,
        classification: "additive-tenant-catalog-category-hierarchy-authority",
        externalConnections: 0,
        productionMutations: 0,
      },
      artifacts: [[UP_066, "up"], [DOWN_066, "down"], [VERIFY_066, "verify"]],
    },
    {
      file: MANIFEST_067,
      metadata: {
        phase: "phase3z-catalog-category-replay-binding",
        postgresqlMajor: 16,
        classification: "additive-tenant-catalog-category-replay-binding-authority",
        externalConnections: 0,
        productionMutations: 0,
      },
      artifacts: [[UP_067, "up"], [DOWN_067, "down"], [VERIFY_067, "verify"]],
    },
  ];
  for (const expected of manifests) {
    const manifest = JSON.parse(readFileSync(path.join(SQL, expected.file), "utf8"));
    assert.deepEqual(
      {
        phase: manifest.phase,
        postgresqlMajor: manifest.postgresqlMajor,
        classification: manifest.classification,
        externalConnections: manifest.externalConnections,
        productionMutations: manifest.productionMutations,
      },
      expected.metadata,
    );
    assert.deepEqual(
      manifest.artifacts.map(({ file, direction }) => [file, direction]),
      expected.artifacts,
    );
    for (const artifact of manifest.artifacts) {
      const source = readFileSync(path.join(SQL, artifact.file));
      assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
      assertNoExternalOrTableAuthority(source.toString("utf8"), artifact.file);
    }
  }
});

test("migrations 066 and 067 stay transaction wrapped and expose only the unchanged begin function", () => {
  const up066 = readFileSync(path.join(SQL, UP_066), "utf8");
  const down066 = readFileSync(path.join(SQL, DOWN_066), "utf8");
  const verify066 = readFileSync(path.join(SQL, VERIFY_066), "utf8");
  const up067 = readFileSync(path.join(SQL, UP_067), "utf8");
  const down067 = readFileSync(path.join(SQL, DOWN_067), "utf8");
  const verify067 = readFileSync(path.join(SQL, VERIFY_067), "utf8");
  for (const source of [up066, down066, verify066, up067, down067, verify067]) {
    assert.match(source, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(source, /COMMIT;\s*$/);
    assertNoExternalOrTableAuthority(source, "SQL artifact");
  }
  for (const source of [up066, down066, up067, down067]) assert.match(source, BEGIN_SIGNATURE);
  assert.match(up066, /REVOKE ALL ON FUNCTION saas\.catalog_migration_category_manifest_valid\(jsonb\) FROM PUBLIC/);
  assert.match(up066, /REVOKE ALL ON FUNCTION saas\.catalog_migration_category_manifest_matches\(uuid,jsonb\) FROM PUBLIC/);
  assert.match(up066, /REVOKE ALL ON FUNCTION saas\.catalog_migration_begin\(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb\) FROM PUBLIC,celebix_saas_app/);
  assert.match(up066, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_begin\(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb\) TO celebix_saas_app/);
  assert.doesNotMatch(up066, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_category_manifest_/);
  assert.deepEqual(up066.match(/\bGRANT\b[^;]*;/gi) ?? [], [BEGIN_EXECUTE_GRANT]);
  assert.deepEqual(down066.match(/\bGRANT\b[^;]*;/gi) ?? [], [BEGIN_EXECUTE_GRANT]);
  assert.deepEqual(verify066.match(/\bGRANT\b[^;]*;/gi) ?? [], []);
  assert.deepEqual(verify067.match(/\bGRANT\b[^;]*;/gi) ?? [], []);
  for (const source of [up067, down067]) {
    assert.equal((source.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
    assert.doesNotMatch(source, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
    assert.doesNotMatch(source, /\b(?:CREATE|DROP)\s+FUNCTION\s+saas\.catalog_migration_category_manifest_/i);
    assert.doesNotMatch(source, /\b(?:GRANT|REVOKE)\b/i);
  }
});

test("067 binds existing-job replay to an accepted fingerprint and byte-restores the 066 begin body", () => {
  const up066 = readFileSync(path.join(SQL, UP_066), "utf8");
  const down066 = readFileSync(path.join(SQL, DOWN_066), "utf8");
  const verify066 = readFileSync(path.join(SQL, VERIFY_066), "utf8");
  const up067 = readFileSync(path.join(SQL, UP_067), "utf8");
  const down067 = readFileSync(path.join(SQL, DOWN_067), "utf8");
  const verify067 = readFileSync(path.join(SQL, VERIFY_067), "utf8");
  assert.match(up066, /CREATE FUNCTION saas\.catalog_migration_category_manifest_valid\(p_categories jsonb\)/);
  assert.match(up066, /ARRAY\['id','name','slug'\],ARRAY\['parentSlug'\]/);
  assert.match(up066, /selected_depth>8/);
  assert.match(up066, /array_position\(known_slugs,selected_slug\) IS NOT NULL/);
  assert.match(up066, /CREATE FUNCTION saas\.catalog_migration_category_manifest_matches\(p_store_id uuid,p_categories jsonb\)/);
  assert.match(up066, /persisted_parent_slug IS DISTINCT FROM candidate->>'parentSlug'/);
  assert.match(up066, /existing_category\.parent_id IS DISTINCT FROM requested_parent_id/);
  assert.match(up066, /catalog_migration_category_manifest_matches\(p_store_id,p_categories\)/);
  assert.match(down066, /DROP FUNCTION saas\.catalog_migration_category_manifest_matches\(uuid,jsonb\)/);
  assert.match(down066, /DROP FUNCTION saas\.catalog_migration_category_manifest_valid\(jsonb\)/);
  assert.doesNotMatch(down066, /\b(?:DELETE|TRUNCATE|DROP TABLE|ALTER TABLE)\b/i);
  assert.match(verify066, /pg_catalog\.pg_get_functiondef/);
  assert.match(verify066, /procedure\.prosecdef/);
  assert.match(verify066, /procedure\.provolatile/);
  assert.match(verify066, /pg_catalog\.pg_get_userbyid\(procedure\.proowner\)/);
  assert.match(verify066, /parentSlug/);
  assert.match(verify066, /parent_id IS DISTINCT FROM requested_parent_id/);

  const begin066 = beginDefinition(up066);
  const begin067 = beginDefinition(up067);
  assert.ok(begin067.includes(BINDING_PREDICATE));
  assert.equal(begin067.replace(BINDING_PREDICATE, ""), begin066);
  assert.equal(beginDefinition(down067), begin066);
  assert.match(verify067, /pg_catalog\.pg_get_functiondef/);
  assert.match(verify067, /procedure\.prosecdef/);
  assert.match(verify067, /procedure\.provolatile/);
  assert.match(verify067, /procedure\.proconfig IS DISTINCT FROM ARRAY\['search_path=pg_catalog, saas'\]::text\[\]/);
  assert.match(verify067, /accepted_begin\.store_id=p_store_id/);
  assert.match(verify067, /accepted_begin\.job_id=existing_job\.id/);
  assert.match(verify067, /accepted_begin\.operation_kind/);
  assert.match(verify067, /accepted_begin\.payload_fingerprint=p_fingerprint/);
  assert.match(verify067, /catalog_migration_category_manifest_matches\(p_store_id,p_categories\)/);
});
