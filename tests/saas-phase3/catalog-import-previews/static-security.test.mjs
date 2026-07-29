import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../"),SQL=path.join(ROOT,"apps/owner/scripts/sql/saas");
const legacy=readFileSync(path.join(SQL,"202607220035_catalog_administration.up.sql"),"utf8"),up=readFileSync(path.join(SQL,"202607220041_catalog_import_previews.up.sql"),"utf8"),down=readFileSync(path.join(SQL,"202607220041_catalog_import_previews.down.sql"),"utf8"),assertions=readFileSync(path.join(SQL,"202607220041_catalog_import_previews_assertions.sql"),"utf8");
const repository=readFileSync(path.join(ROOT,"packages/saas-data/src/catalog-admin/repository.ts"),"utf8"),harness=readFileSync(path.join(ROOT,"tests/saas-phase3/catalog-import-previews/postgres-harness.mjs"),"utf8");

test("migration 041 is pinned by the completion manifest",()=>{
 const manifest=JSON.parse(readFileSync(path.join(SQL,"phase3h-merchant-completion-manifest.json"),"utf8"));
 assert.equal(manifest.artifacts.length, 33);
 for(const file of ["202607220041_catalog_import_previews.up.sql","202607220041_catalog_import_previews.down.sql","202607220041_catalog_import_previews_assertions.sql"]){
  const artifact=manifest.artifacts.find(entry=>entry.file===file);assert.ok(artifact,file);assert.equal(createHash("sha256").update(readFileSync(path.join(SQL,file))).digest("hex"),artifact.sha256,file);
 }
});
test("SQL accepts only canonical rows and digest, never raw CSV",()=>{
 assert.match(up,/payload_digest char\(64\)/);assert.match(up,/pg_catalog\.pg_column_size\(rows\)<=131072/);assert.match(up,/jsonb_array_length\(rows\) BETWEEN 1 AND 100/);
 assert.doesNotMatch(up,/\bp_raw|\braw_csv|\bcsv_bytes|\bfile_bytes/i);
 assert.match(up,/CREATE FUNCTION saas\.catalog_admin_prepare_import_preview/);assert.match(up,/p_rows jsonb/);
});
test("confirmation is row locked atomic and replay safe",()=>{
 const body=up.slice(up.indexOf("CREATE FUNCTION saas.catalog_admin_commit_import_preview"),up.indexOf("CREATE FUNCTION saas.catalog_admin_recover_import_preview_operation"));
 assert.match(body,/pg_advisory_xact_lock/);assert.match(body,/FOR UPDATE/);assert.match(body,/preview\.format IS DISTINCT FROM p_format/);assert.match(body,/preview\.payload_digest IS DISTINCT FROM p_digest/);assert.match(body,/preview\.rows IS DISTINCT FROM p_rows/);assert.match(body,/preview\.expires_at<=p_now/);assert.match(body,/product_limit_reached/);assert.match(body,/INSERT INTO saas\.products/);assert.match(body,/INSERT INTO saas\.product_variants/);assert.match(body,/INSERT INTO saas\.catalog_import_jobs/);assert.match(body,/status='consumed'/);assert.match(body,/operation_replayed/);assert.match(body,/operation_mismatch/);
});
test("prepare and confirmation take the exact shared store lock before product-limit counts",()=>{
 for(const [start,end] of [["CREATE FUNCTION saas.catalog_admin_prepare_import_preview","CREATE FUNCTION saas.catalog_admin_get_import_preview"],["CREATE FUNCTION saas.catalog_admin_commit_import_preview","CREATE FUNCTION saas.catalog_admin_recover_import_preview_operation"]]){
  const body=up.slice(up.indexOf(start),up.indexOf(end));
  const lock=body.indexOf("'saas.catalog.store:' || p_store_id::text");
  const count=body.indexOf("FROM saas.products WHERE store_id=p_store_id");
  assert.ok(lock>-1&&lock<count,`${start} lock ordering`);
 }
});
test("legacy and preview writers share the exact store lock and rollback restores migration 035",()=>{
 const functionBody=(source,start)=>{const offset=source.indexOf(start);assert.ok(offset>-1,start);const bodyStart=source.indexOf("AS $f$",offset),bodyEnd=source.indexOf("END $f$;",bodyStart);assert.ok(bodyStart>-1&&bodyEnd>bodyStart,start);return source.slice(bodyStart,bodyEnd+8);};
 const start="FUNCTION saas.catalog_admin_import_products";
 const upgraded=functionBody(up,start),baseline=functionBody(legacy,start),restored=functionBody(down,start);
 const lock=upgraded.indexOf("'saas.catalog.store:' || p_store_id::text"),count=upgraded.indexOf("FROM saas.products WHERE store_id=p_store_id");
 assert.ok(lock>-1&&lock<count,"legacy writer lock ordering");
 assert.equal(restored,baseline,"041 down must restore the exact 035 legacy body");
 assert.doesNotMatch(restored,/saas\.catalog\.store:/);
});
test("preview identity is trigger-immutable while lifecycle version transitions remain finite",()=>{
 assert.match(up,/CREATE FUNCTION saas\.guard_catalog_import_preview_mutation/);
 assert.match(up,/OLD\.format IS DISTINCT FROM NEW\.format/);
 assert.match(up,/OLD\.payload_digest IS DISTINCT FROM NEW\.payload_digest/);
 assert.match(up,/OLD\.rows IS DISTINCT FROM NEW\.rows/);
 assert.match(up,/NEW\.version<>OLD\.version\+1/);
 assert.match(up,/BEFORE UPDATE OR DELETE ON saas\.catalog_import_previews/);
});
test("table ACL and rollback surface are exact",()=>{
 assert.match(up,/ENABLE ROW LEVEL SECURITY/);assert.match(up,/FORCE ROW LEVEL SECURITY/);assert.match(up,/REVOKE ALL ON saas\.catalog_import_previews/);assert.match(assertions,/pg_catalog\.aclexplode/);
 assert.match(down,/DROP TABLE saas\.catalog_import_previews/);assert.match(down,/DELETE FROM saas\.catalog_admin_operations WHERE operation_kind IN\('prepare_import_preview','commit_import_preview'\)/);assert.doesNotMatch(down,/DROP TABLE saas\.catalog_admin_operations/);
});
test("repository unknown COMMIT uses one read-only preview recovery and no write retry",()=>{
 assert.match(repository,/catalog_admin_recover_import_preview_operation/);assert.match(repository,/BEGIN READ ONLY/);assert.match(repository,/release\(client,\s*true\)/);
 const commit=repository.slice(repository.indexOf("async commitImportPreview"));assert.equal((commit.match(/catalog_admin_commit_import_preview/g)??[]).length,1);
});
test("commit fingerprint binds the persisted immutable preview snapshot in one transaction",()=>{
 const commit=repository.slice(repository.indexOf("async commitImportPreview"));
 const snapshot=commit.indexOf("catalog_admin_get_import_preview"),fingerprint=commit.indexOf("catalogAdminFingerprint",snapshot),mutation=commit.indexOf("catalog_admin_commit_import_preview",fingerprint);
 assert.ok(snapshot>-1&&snapshot<fingerprint&&fingerprint<mutation);
 for(const field of ["previewId","expectedVersion","format:persisted.format","digest:persisted.digest","rows:persisted.rows"])assert.ok(commit.includes(field),field);
 assert.match(commit,/persisted\.format,persisted\.digest,JSON\.stringify\(persisted\.rows\)/);
});
test("disposable proof covers concurrency backup restore rollback and cleanup",()=>{
 for(const witness of ["concurrent double confirmation","different previews serialize at the near limit","preview and legacy import serialize at 99 of 100","backup and restore preserve executable authority","rollback removes only 041","cleanup removes disposable PostgreSQL"])assert.ok(harness.includes(witness),witness);
 assert.match(harness,/pg_dump/);assert.match(harness,/pg_restore/);assert.doesNotMatch(harness,/pg_sleep/);
 assert.match(harness,/celebix_saas_owner/);assert.doesNotMatch(harness,/--no-owner/);
});
test("no provider OAuth AI network or credential behavior is introduced",()=>{
 for(const source of [up,down,repository])assert.doesNotMatch(source,/\b(?:oauth|access_token|refresh_token|client_secret|api_key|fetch\(|https?:\/\/|openai|anthropic)\b/i);
});
