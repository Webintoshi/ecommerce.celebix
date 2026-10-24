import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const sourcePaths = ["src/contracts.ts","src/providers/akbank/adapter.ts","src/providers/akbank/config.ts","src/providers/akbank/packet.ts","src/transport.ts","src/validation.ts"];
const sources = sourcePaths.map(path => ({path,bytes:new TextEncoder().encode(`${path}\n`)}));
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

test("Akbank manifests bind every exact source and reject incomplete or hostile authority", async () => {
  const binding = await import("./build-binding.ts");
  const manifest = binding.createAkbankAdapterSourceManifest([...sources].reverse());
  assert.deepEqual(manifest.files.map(file => file.path),sourcePaths);
  const files = sources.map(source => ({path:source.path,sha256:hash(new TextDecoder().decode(source.bytes))}));
  assert.equal(manifest.sourceDigest,hash(JSON.stringify({schemaVersion:1,files})));
  const changed = binding.createAkbankAdapterSourceManifest(sources.map((source,index) => index===0 ? {...source,bytes:new Uint8Array([42])} : source));
  assert.notEqual(changed.sourceDigest,manifest.sourceDigest);
  for (const invalid of [sources.slice(1),[...sources.slice(1),sources[1]!],new Proxy(sources,{}),[{...sources[0]!,extra:true},...sources.slice(1)]]) assert.throws(() => binding.createAkbankAdapterSourceManifest(invalid),/akbank_build_binding_invalid/);
});

test("Akbank candidates remain separate from explicit environment-bound execution admission", async () => {
  const binding = await import("./build-binding.ts");
  const sourceManifest = binding.createAkbankAdapterSourceManifest(sources);
  const first = binding.createAkbankCandidateBuildMetadata({environment:"test",gitSha:"1".repeat(40),sourceManifest});
  const second = binding.createAkbankCandidateBuildMetadata({environment:"live",gitSha:"1".repeat(40),sourceManifest});
  assert.notEqual(first.candidateExecutionDigest,second.candidateExecutionDigest);
  assert.equal(binding.verifyAkbankGeneratedBuildMetadata(first,{environment:"test",gitSha:"1".repeat(40),sourceManifest})?.candidateExecutionDigest,first.candidateExecutionDigest);
  for (const value of [{...first,environment:"live"},{...first,sourceDigest:`sha256:${"0".repeat(64)}`},{...first,candidateExecutionDigest:`sha256:${"0".repeat(64)}`},{...first,approved:true}]) assert.equal(binding.verifyAkbankGeneratedBuildMetadata(value,{environment:"test",gitSha:"1".repeat(40),sourceManifest}),null);
  const directory=await mkdtemp(join(tmpdir(),"celebix-akbank-no-admission-"));
  try {
    await writeFile(join(directory,"build-binding.ts"),await readFile(new URL("./build-binding.ts",import.meta.url)));
    await writeFile(join(directory,"build-metadata.generated.ts"),"export const AKBANK_GENERATED_BUILD_METADATA={test:null,live:null};export const AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES={test:null,live:null};");
    const unadmitted=await import(pathToFileURL(join(directory,"build-binding.ts")).href) as typeof binding;
    assert.deepEqual(unadmitted.AKBANK_APPROVED_EXECUTION_AUTHORITIES,{test:null,live:null});
    assert.equal(unadmitted.resolveAkbankCompiledExecutionAuthority("test"),null);
    assert.equal(unadmitted.resolveAkbankCompiledExecutionAuthority("live"),null);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("compiled Akbank authorities reject crossed environments and forged candidate fields", async () => {
  const binding = await import("./build-binding.ts");
  const sourceManifest = binding.createAkbankAdapterSourceManifest(sources);
  const candidate = binding.createAkbankCandidateBuildMetadata({environment:"live",gitSha:"1".repeat(40),sourceManifest});
  const authority = {environment:"live",adapterVersion:1,evidenceDigest:candidate.candidateExecutionDigest};
  for (const [selectedCandidate,selectedAuthority,valid] of [[candidate,authority,true],[candidate,{...authority,environment:"test"},false],[{...candidate,gitSha:"2".repeat(40)},authority,false],[candidate,{...authority,evidenceDigest:`sha256:${"0".repeat(64)}`},false],[candidate,null,false]] as const) {
    const directory = await mkdtemp(join(tmpdir(),"celebix-akbank-binding-"));
    try {
      await writeFile(join(directory,"build-binding.ts"),await readFile(new URL("./build-binding.ts",import.meta.url)));
      await writeFile(join(directory,"build-metadata.generated.ts"),`export const AKBANK_GENERATED_BUILD_METADATA = ${JSON.stringify({test:null,live:selectedCandidate})};\nexport const AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES = ${JSON.stringify({test:null,live:selectedAuthority})};\n`);
      const compiled = await import(pathToFileURL(join(directory,"build-binding.ts")).href) as typeof binding;
      assert.equal(compiled.resolveAkbankCompiledExecutionAuthority("live")?.evidenceDigest ?? null,valid ? authority.evidenceDigest : null);
      assert.equal(compiled.resolveAkbankCompiledExecutionAuthority("test"),null);
    } finally { await rm(directory,{recursive:true,force:true}); }
  }
});


test("reviewed Akbank source keeps its admitted identity across unrelated release commits", async () => {
  const binding = await import("./build-binding.ts");
  const sourceManifest = binding.createAkbankAdapterSourceManifest(sources);
  const first = binding.createAkbankCandidateBuildMetadata({environment:"live",gitSha:"1".repeat(40),sourceManifest});
  const second = binding.createAkbankCandidateBuildMetadata({environment:"live",gitSha:"2".repeat(40),sourceManifest});
  const directory = await mkdtemp(join(tmpdir(),"celebix-akbank-reviewed-binding-"));
  try {
    const source = await readFile(new URL("./build-binding.ts",import.meta.url),"utf8");
    const review = {sourceDigest:sourceManifest.sourceDigest,gitShas:{test:"3".repeat(40),live:"1".repeat(40)}};
    const rewritten = source.replace(/const REVIEWED_SOURCE_ADMISSIONS: readonly AkbankSourceAdmission\[\] = Object.freeze\([\s\S]*?\);/,`const REVIEWED_SOURCE_ADMISSIONS: readonly AkbankSourceAdmission[] = Object.freeze([${JSON.stringify(review)}]);`);
    await writeFile(join(directory,"build-binding.ts"),rewritten);
    await writeFile(join(directory,"build-metadata.generated.ts"),"export const AKBANK_GENERATED_BUILD_METADATA={test:null,live:null};export const AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES={test:null,live:null};");
    const reviewed=await import(pathToFileURL(join(directory,"build-binding.ts")).href) as typeof binding;
    assert.equal(reviewed.canonicalAkbankExecutionEvidenceDigest(first),first.candidateExecutionDigest);
    assert.equal(reviewed.canonicalAkbankExecutionEvidenceDigest(second),first.candidateExecutionDigest);
    const changed=binding.createAkbankCandidateBuildMetadata({environment:"live",gitSha:"2".repeat(40),sourceManifest:binding.createAkbankAdapterSourceManifest(sources.map((source,index)=>index===0?{...source,bytes:new Uint8Array([42])}:source))});
    assert.equal(reviewed.canonicalAkbankExecutionEvidenceDigest(changed),changed.candidateExecutionDigest);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
