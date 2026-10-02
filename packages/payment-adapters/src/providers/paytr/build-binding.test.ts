import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { PaytrCandidateBuildMetadata } from "./build-metadata.generated.ts";

const SOURCE_BYTES = Object.freeze([
  Object.freeze({ path: "src/validation.ts", bytes: new TextEncoder().encode("validation-v1\n") }),
  Object.freeze({ path: "src/transport.ts", bytes: new TextEncoder().encode("transport-v1\n") }),
  Object.freeze({ path: "src/providers/paytr/packet.ts", bytes: new TextEncoder().encode("packet-v1\n") }),
  Object.freeze({ path: "src/providers/paytr/config.ts", bytes: new TextEncoder().encode("config-v1\n") }),
  Object.freeze({ path: "src/providers/paytr/adapter.ts", bytes: new TextEncoder().encode("adapter-v1\n") }),
  Object.freeze({ path: "src/contracts.ts", bytes: new TextEncoder().encode("contracts-v1\n") }),
]);
const SOURCE_DIGEST = "sha256:6a542c1eba51e653d42e956368536fe9528b6232f2a9b5a9f6f04e90f7d5594b";
const CANDIDATE_DIGESTS = Object.freeze({
  test: "sha256:05d98ed7af8c4ac4589d60b1d182bb16536415b0c59f3622b7cbe8de1e14e3e7",
  live: "sha256:558d1ae034512b3a0208c614f26d8044c1d34bbfc94767627b6093b283e6a9a6",
});
const REVIEWED_SOURCES = Object.freeze([
  "sha256:07b8bd8d8324dfee9effd013f2b4278296807d4d9368f4510d8727c610c93fc6",
  "sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d",
  "sha256:ed6671e40af5116572449b29f759b79de431550173a7afccf0149566e6b15d2b",
]);
const REVIEWED_EXECUTION_DIGESTS = Object.freeze({
  test: "sha256:b332fb0e51c6a4e340366507a8eace2aaed42482fb062f085c50576aff931c8f",
  live: "sha256:14bbcbf73e0fbc41c3e4749b4dff59ce5a98df238e82becb2ddc503dea9abf2c",
});

function reviewedCandidate(environment: "test" | "live", gitSha: string, sourceDigest: string): PaytrCandidateBuildMetadata {
  const evidence = {
    evidenceSchemaVersion: 1 as const,
    providerCode: "paytr_iframe" as const,
    capability: "payment_processing" as const,
    environment,
    adapterVersion: 1 as const,
    gitSha,
    sourceDigest,
  };
  return Object.freeze({
    buildMetadataSchemaVersion: 1,
    ...evidence,
    candidateExecutionDigest: `sha256:${createHash("sha256").update(JSON.stringify(evidence)).digest("hex")}`,
  });
}

async function generatedBinding(candidate: unknown, authority: unknown, environment: "test" | "live") {
  const directory = await mkdtemp(join(tmpdir(), "celebix-paytr-build-binding-"));
  try {
    await writeFile(join(directory, "build-binding.ts"), await readFile(new URL("./build-binding.ts", import.meta.url)));
    await writeFile(join(directory, "build-metadata.generated.ts"),
      `export const PAYTR_GENERATED_BUILD_METADATA = ${JSON.stringify({ test: null, live: null, [environment]: candidate })};\n`
      + `export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES = ${JSON.stringify({ test: null, live: null, [environment]: authority })};\n`);
    return await import(pathToFileURL(join(directory, "build-binding.ts")).href) as typeof import("./build-binding.ts");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("reviewed PayTR execution keeps its approval across UI-only Git SHA changes", async () => {
  for (const environment of ["test", "live"] as const) {
    const authority = { environment, adapterVersion: 1, evidenceDigest: REVIEWED_EXECUTION_DIGESTS[environment] };
    for (const sourceDigest of REVIEWED_SOURCES) {
      const first = reviewedCandidate(environment, "1".repeat(40), sourceDigest);
      const second = reviewedCandidate(environment, "2".repeat(40), sourceDigest);
      assert.notEqual(first.candidateExecutionDigest, second.candidateExecutionDigest);
      for (const candidate of [first, second]) {
        const binding = await generatedBinding(candidate, authority, environment);
        assert.deepEqual(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES[environment], authority);
        assert.equal(binding.canonicalPaytrExecutionEvidenceDigest(candidate), REVIEWED_EXECUTION_DIGESTS[environment]);
        assert.equal(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES[environment === "test" ? "live" : "test"], null);
      }
    }
  }
});

test("an unreviewed PayTR execution source cannot inherit the previous approval", async () => {
  const binding = await import("./build-binding.ts");
  const previousAuthority = { environment: "test", adapterVersion: 1, evidenceDigest: REVIEWED_EXECUTION_DIGESTS.test };
  for (const sourceDigest of [SOURCE_DIGEST, ...REVIEWED_SOURCES.map((digest) => `${digest.slice(0, -1)}c`)]) {
    const candidate = reviewedCandidate("test", "1".repeat(40), sourceDigest);
    const expectedDigest = sourceDigest === SOURCE_DIGEST ? CANDIDATE_DIGESTS.test : candidate.candidateExecutionDigest;
    assert.equal(binding.canonicalPaytrExecutionEvidenceDigest(candidate), expectedDigest);
    const unapproved = await generatedBinding(candidate, previousAuthority, "test");
    assert.equal(unapproved.PAYTR_APPROVED_EXECUTION_AUTHORITIES.test, null);
    const newlyApproved = await generatedBinding(candidate, { ...previousAuthority, evidenceDigest: expectedDigest }, "test");
    assert.equal(newlyApproved.PAYTR_APPROVED_EXECUTION_AUTHORITIES.test?.evidenceDigest, expectedDigest);
  }
});

test("canonical PayTR execution rejects forged metadata before preserving an approval", async () => {
  const binding = await import("./build-binding.ts");
  const candidate = reviewedCandidate("test", "1".repeat(40), REVIEWED_SOURCES[2]!);
  let getterReads = 0;
  const accessor = Object.defineProperty({ ...candidate }, "gitSha", { enumerable: true, get: () => { getterReads += 1; return candidate.gitSha; } });
  for (const malformed of [
    null,
    new Proxy(candidate, {}),
    accessor,
    { ...candidate, approved: true },
    { ...candidate, buildMetadataSchemaVersion: 2 },
    { ...candidate, evidenceSchemaVersion: 2 },
    { ...candidate, providerCode: "iyzico_iframe" },
    { ...candidate, capability: "refund_processing" },
    { ...candidate, environment: "sandbox" },
    { ...candidate, adapterVersion: 2 },
    { ...candidate, gitSha: "A".repeat(40) },
    { ...candidate, gitSha: "2".repeat(40) },
    { ...candidate, sourceDigest: REVIEWED_SOURCES[0] },
    { ...candidate, candidateExecutionDigest: `sha256:${"0".repeat(64)}` },
    { ...candidate, environment: "live" },
  ]) {
    assert.throws(() => binding.canonicalPaytrExecutionEvidenceDigest(malformed as PaytrCandidateBuildMetadata), /paytr_build_binding_invalid/);
  }
  assert.equal(getterReads, 0);
});

test("generated PayTR approval stays bound to its exact environment and canonical identity", async () => {
  for (const environment of ["test", "live"] as const) {
    const candidate = reviewedCandidate(environment, "2".repeat(40), REVIEWED_SOURCES[2]!);
    const otherEnvironment = environment === "test" ? "live" : "test";
    for (const authority of [
      { environment: otherEnvironment, adapterVersion: 1, evidenceDigest: REVIEWED_EXECUTION_DIGESTS[environment] },
      { environment, adapterVersion: 1, evidenceDigest: REVIEWED_EXECUTION_DIGESTS[otherEnvironment] },
      { environment, adapterVersion: 2, evidenceDigest: REVIEWED_EXECUTION_DIGESTS[environment] },
      { environment, adapterVersion: 1, evidenceDigest: candidate.candidateExecutionDigest },
    ]) {
      const binding = await generatedBinding(candidate, authority, environment);
      assert.equal(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES[environment], null);
    }
    const missingApproval = await generatedBinding(candidate, null, environment);
    assert.equal(missingApproval.PAYTR_APPROVED_EXECUTION_AUTHORITIES[environment], null);
  }
});

test("PayTR build source manifest binds the exact execution closure", async () => {
  const binding = await import("./build-binding.ts").catch(() => null);
  assert.ok(binding, "PayTR build-binding module must exist");

  const manifest = binding.createPaytrAdapterSourceManifest(SOURCE_BYTES);

  assert.equal(manifest.sourceDigest, SOURCE_DIGEST);
  assert.deepEqual(manifest.files.map((file: { path: string }) => file.path), [
    "src/contracts.ts",
    "src/providers/paytr/adapter.ts",
    "src/providers/paytr/config.ts",
    "src/providers/paytr/packet.ts",
    "src/transport.ts",
    "src/validation.ts",
  ]);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.files), true);
});

test("PayTR build source manifest rejects incomplete duplicate and hostile input", async () => {
  const binding = await import("./build-binding.ts");
  const duplicate = Object.freeze({
    path: SOURCE_BYTES[1]!.path,
    bytes: new Uint8Array(SOURCE_BYTES[1]!.bytes),
  });
  for (const invalid of [
    SOURCE_BYTES.slice(1),
    [...SOURCE_BYTES.slice(1), duplicate],
    [...SOURCE_BYTES, Object.freeze({ path: "src/registry.ts", bytes: new Uint8Array([1]) })],
    new Proxy([...SOURCE_BYTES], {}),
  ]) {
    assert.throws(
      () => binding.createPaytrAdapterSourceManifest(invalid),
      /paytr_build_binding_invalid/,
    );
  }
});

test("PayTR build candidates bind test and live to distinct immutable digests", async () => {
  const binding = await import("./build-binding.ts");
  const sourceManifest = binding.createPaytrAdapterSourceManifest(SOURCE_BYTES);

  for (const environment of ["test", "live"] as const) {
    const candidate = binding.createPaytrCandidateBuildMetadata({
      environment,
      gitSha: "1".repeat(40),
      sourceManifest,
    });
    assert.deepEqual(candidate, {
      buildMetadataSchemaVersion: 1,
      evidenceSchemaVersion: 1,
      providerCode: "paytr_iframe",
      capability: "payment_processing",
      environment,
      adapterVersion: 1,
      gitSha: "1".repeat(40),
      sourceDigest: SOURCE_DIGEST,
      candidateExecutionDigest: CANDIDATE_DIGESTS[environment],
    });
    assert.equal(Object.isFrozen(candidate), true);
  }
});

test("PayTR generated metadata verification rejects environment source and digest mismatch", async () => {
  const binding = await import("./build-binding.ts");
  const sourceManifest = binding.createPaytrAdapterSourceManifest(SOURCE_BYTES);
  const expectedBuild = { environment: "test" as const, gitSha: "1".repeat(40), sourceManifest };
  const candidate = binding.createPaytrCandidateBuildMetadata(expectedBuild);

  assert.deepEqual(binding.verifyPaytrGeneratedBuildMetadata(candidate, expectedBuild), candidate);
  for (const mismatch of [
    { ...candidate, environment: "live" },
    { ...candidate, gitSha: "2".repeat(40) },
    { ...candidate, sourceDigest: `sha256:${"2".repeat(64)}` },
    { ...candidate, candidateExecutionDigest: `sha256:${"3".repeat(64)}` },
    { ...candidate, approved: true },
  ]) {
    assert.equal(binding.verifyPaytrGeneratedBuildMetadata(mismatch, expectedBuild), null);
  }
});

test("PayTR source-control build authority approves test and live with distinct evidence", async () => {
  const [generated, binding, api] = await Promise.all([
    import("./build-metadata.generated.ts").catch(() => null),
    import("./build-binding.ts"),
    import("../../index.ts"),
  ]);

  assert.ok(generated);
  assert.ok(generated.PAYTR_GENERATED_BUILD_METADATA.test);
  assert.ok(generated.PAYTR_GENERATED_BUILD_METADATA.live);
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.test.environment, "test");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.live.environment, "live");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.test.providerCode, "paytr_iframe");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.live.providerCode, "paytr_iframe");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.test.capability, "payment_processing");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.live.capability, "payment_processing");
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.test.adapterVersion, 1);
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.live.adapterVersion, 1);
  assert.notEqual(
    generated.PAYTR_GENERATED_BUILD_METADATA.test.candidateExecutionDigest,
    generated.PAYTR_GENERATED_BUILD_METADATA.live.candidateExecutionDigest,
  );
  assert.deepEqual(generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES, {
    test: {
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: binding.canonicalPaytrExecutionEvidenceDigest(generated.PAYTR_GENERATED_BUILD_METADATA.test),
    },
    live: {
      environment: "live",
      adapterVersion: 1,
      evidenceDigest: binding.canonicalPaytrExecutionEvidenceDigest(generated.PAYTR_GENERATED_BUILD_METADATA.live),
    },
  });
  assert.deepEqual(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES, generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES);
  assert.deepEqual(api.PAYTR_APPROVED_EXECUTION_AUTHORITIES, generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES), true);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES.test), true);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES.live), true);
});
