import assert from "node:assert/strict";
import test from "node:test";

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

test("PayTR source-control build authority approves distinct test and live bindings", async () => {
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
      evidenceDigest: generated.PAYTR_GENERATED_BUILD_METADATA.test.candidateExecutionDigest,
    },
    live: {
      environment: "live",
      adapterVersion: 1,
      evidenceDigest: generated.PAYTR_GENERATED_BUILD_METADATA.live.candidateExecutionDigest,
    },
  });
  assert.deepEqual(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES, generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES);
  assert.deepEqual(api.PAYTR_APPROVED_EXECUTION_AUTHORITIES, generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES), true);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES.test), true);
  assert.equal(Object.isFrozen(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES.live), true);
});
