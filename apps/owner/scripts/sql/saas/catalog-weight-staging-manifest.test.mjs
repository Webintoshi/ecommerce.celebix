import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
const root=new URL("./",import.meta.url);const manifest=JSON.parse(readFileSync(new URL("phase-catalog-weight-v1-staging-manifest.json",root),"utf8"));
const hash=url=>createHash("sha256").update(readFileSync(url)).digest("hex");
test("catalog weight staging migration and exact backfill are checksum pinned",()=>{
  assert.equal(manifest.phase,"catalog-weight-v1-staging");assert.match(manifest.inventorySourceHead,/^[a-f0-9]{40}$/u);
  assert.equal(hash(new URL(manifest.migration.file,root)),manifest.migration.sha256);
  assert.equal(hash(new URL(manifest.migration.assertions,root)),manifest.migration.assertionsSha256);
  assert.equal(hash(new URL(manifest.migration.down,root)),manifest.migration.downSha256);
  const repoRoot=new URL("../../../../../",root);assert.equal(hash(new URL(manifest.backfillManifest.file,repoRoot)),manifest.backfillManifest.sha256);
  assert.equal(manifest.backfillManifest.storeId,"a828862c-4cc1-475a-89cc-5fbee31eb43f");assert.equal(manifest.backfillManifest.eligibleWrites,1);
});
