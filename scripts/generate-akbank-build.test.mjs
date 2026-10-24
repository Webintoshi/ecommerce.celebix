import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { generateAkbankBuild } from "./generate-akbank-build.mjs";
import { AKBANK_ADAPTER_SOURCE_PATHS } from "../packages/payment-adapters/src/providers/akbank/build-binding.ts";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),"celebix-akbank-build-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  for (const path of AKBANK_ADAPTER_SOURCE_PATHS) { const target=join(root,"packages/payment-adapters",path);await mkdir(dirname(target),{recursive:true});await writeFile(target,`${path}\n`); }
  return {root,generated:join(root,"packages/payment-adapters/src/providers/akbank/build-metadata.generated.ts")};
}
const sourceCommit = "1".repeat(40);

test("Akbank build candidates do not become execution authority without explicit digest admission", async t => {
  const {root,generated} = await fixture(t);
  const candidates = await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:false});
  assert.notEqual(candidates.test.candidateExecutionDigest,candidates.live.candidateExecutionDigest);
  const metadata = await import(pathToFileURL(generated).href);
  assert.deepEqual(metadata.AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES,{test:null,live:null});
  assert.equal(metadata.AKBANK_GENERATED_BUILD_METADATA.test.gitSha,sourceCommit);
  await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:true});
});

test("Akbank exact reviewed digest admission stays environment scoped", async t => {
  const {root,generated} = await fixture(t);
  const candidates = await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:false});
  await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit,CELEBIX_AKBANK_TEST_APPROVAL_MODE:"reviewed_hosted_test",CELEBIX_AKBANK_TEST_APPROVED_EVIDENCE_DIGEST:candidates.test.candidateExecutionDigest,CELEBIX_AKBANK_LIVE_APPROVAL_MODE:"reviewed_hosted_live",CELEBIX_AKBANK_LIVE_APPROVED_EVIDENCE_DIGEST:candidates.live.candidateExecutionDigest},check:false});
  const metadata=await import(`${pathToFileURL(generated).href}?approved`);
  assert.equal(metadata.AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES.test.evidenceDigest,candidates.test.candidateExecutionDigest);
  assert.equal(metadata.AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES.live.evidenceDigest,candidates.live.candidateExecutionDigest);
});

test("Akbank invalid or crossed admission cannot replace an existing generated file", async t => {
  const {root,generated} = await fixture(t);
  const candidates=await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:false});
  const sentinel="previous-output\n";
  await writeFile(generated,sentinel);
  for (const environment of [{SOURCE_COMMIT:sourceCommit,CELEBIX_AKBANK_TEST_APPROVAL_MODE:"reviewed_hosted_test"},{SOURCE_COMMIT:sourceCommit,CELEBIX_AKBANK_LIVE_APPROVAL_MODE:"reviewed_hosted_live",CELEBIX_AKBANK_LIVE_APPROVED_EVIDENCE_DIGEST:candidates.test.candidateExecutionDigest},{SOURCE_COMMIT:sourceCommit,CELEBIX_AKBANK_LIVE_APPROVAL_MODE:"approved_live",CELEBIX_AKBANK_LIVE_APPROVED_EVIDENCE_DIGEST:candidates.live.candidateExecutionDigest},{SOURCE_COMMIT:sourceCommit,CELEBIX_AKBANK_TEST_APPROVAL_EXTRA:"private"}]) {
    await assert.rejects(generateAkbankBuild({repositoryRoot:root,environment,check:false}),/akbank_build_invalid/);
    assert.equal(await readFile(generated,"utf8"),sentinel);
  }
});

test("Akbank check detects source drift without rewriting generated admission", async t => {
  const {root,generated}=await fixture(t);
  await generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:false});
  const previous=await readFile(generated,"utf8");
  await writeFile(join(root,"packages/payment-adapters/src/transport.ts"),"changed source\n");
  await assert.rejects(generateAkbankBuild({repositoryRoot:root,environment:{SOURCE_COMMIT:sourceCommit},check:true}),/akbank_build_invalid/);
  assert.equal(await readFile(generated,"utf8"),previous);
});
