import assert from "node:assert/strict";
import test from "node:test";

const SOURCE_BYTES = Object.freeze([
  Object.freeze({ path: "src/validation.ts", bytes: new TextEncoder().encode("validation-v1\n") }),
  Object.freeze({ path: "src/transport.ts", bytes: new TextEncoder().encode("transport-v1\n") }),
  Object.freeze({ path: "src/providers/iyzico/packet.ts", bytes: new TextEncoder().encode("packet-v1\n") }),
  Object.freeze({ path: "src/providers/iyzico/config.ts", bytes: new TextEncoder().encode("config-v1\n") }),
  Object.freeze({ path: "src/providers/iyzico/adapter.ts", bytes: new TextEncoder().encode("adapter-v1\n") }),
  Object.freeze({ path: "src/contracts.ts", bytes: new TextEncoder().encode("contracts-v1\n") }),
]);
const EXPECTED_METADATA = Object.freeze({
  buildMetadataSchemaVersion: 1,
  evidenceSchemaVersion: 1,
  providerCode: "iyzico_iframe",
  capability: "payment_processing",
  environment: "test",
  adapterVersion: 1,
  gitSha: "1".repeat(40),
  sourceDigest: "sha256:6280412d2060bc30bc1c119afeff66791521bd95db6ec37791ec2d54917ad5ee",
  candidateExecutionDigest: "sha256:1ad2b0fbdef7156531ba2cfd181674e3f989f83e634d354b5603a49896ea348a",
});

test("Iyzico source manifest sorts the exact execution closure and binds every source byte", async () => {
  const modulePath = "./build-binding.ts";
  const binding = await import(modulePath).catch(() => null);
  assert.ok(binding, "Iyzico build-binding module must exist");

  const manifest = binding.createIyzicoAdapterSourceManifest(SOURCE_BYTES);

  assert.deepEqual(manifest, {
    schemaVersion: 1,
    files: [
      { path: "src/contracts.ts", sha256: "sha256:f0766ff6a0eb34a91d6bcda35dd2e50f739b56ff6ea7d4a3b372f9b4a5bb2ba7" },
      { path: "src/providers/iyzico/adapter.ts", sha256: "sha256:7a2084cf00ac07d47f1385f3534bc87202862e783aba40dc5705e80aa5f0af47" },
      { path: "src/providers/iyzico/config.ts", sha256: "sha256:fb4d01e88dcb199d055c31268146167f20ab6b34dde368277de25c766cd74aa9" },
      { path: "src/providers/iyzico/packet.ts", sha256: "sha256:7c388f57bd5c1ea65136539a5a6860158fe1ac4fc515a5ac833896e10dc8238e" },
      { path: "src/transport.ts", sha256: "sha256:bdaa86860d9fb7e54bb075d20361858bedff35ad9292145de65846223edc6f98" },
      { path: "src/validation.ts", sha256: "sha256:78004412250ced626eaa98ce4f91a67237012414fdc7a5997017d90ea48a9f99" },
    ],
    sourceDigest: "sha256:6280412d2060bc30bc1c119afeff66791521bd95db6ec37791ec2d54917ad5ee",
  });
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.files), true);
  assert.equal(manifest.files.every((entry: unknown) => Object.isFrozen(entry)), true);
});

test("Iyzico source manifest rejects missing duplicate unknown and non-exact source authority", async () => {
  const modulePath = "./build-binding.ts";
  const binding = await import(modulePath);
  const extra = Object.freeze({ path: "src/registry.ts", bytes: new Uint8Array([1]) });
  const duplicate = Object.freeze({
    path: SOURCE_BYTES[1]!.path,
    bytes: new Uint8Array(SOURCE_BYTES[1]!.bytes),
  });
  const withExtraKey = Object.freeze({
    path: SOURCE_BYTES[0]!.path,
    bytes: new Uint8Array(SOURCE_BYTES[0]!.bytes),
    digest: "browser-authority",
  });
  const hostileBytes = new Proxy(new Uint8Array([1]), {});

  for (const invalid of [
    SOURCE_BYTES.slice(1),
    [...SOURCE_BYTES.slice(1), duplicate],
    [...SOURCE_BYTES, extra],
    [withExtraKey, ...SOURCE_BYTES.slice(1)],
    [{ path: SOURCE_BYTES[0]!.path, bytes: hostileBytes }, ...SOURCE_BYTES.slice(1)],
    new Proxy([...SOURCE_BYTES], {}),
  ]) {
    assert.throws(
      () => binding.createIyzicoAdapterSourceManifest(invalid),
      /iyzico_build_binding_invalid/,
    );
  }
});

test("candidate execution digest binds Iyzico TEST adapter v1 to git source and evidence schema v1", async () => {
  const modulePath = "./build-binding.ts";
  const binding = await import(modulePath);
  const sourceManifest = binding.createIyzicoAdapterSourceManifest(SOURCE_BYTES);

  const metadata = binding.createIyzicoCandidateBuildMetadata({
    gitSha: "1".repeat(40),
    sourceManifest,
  });

  assert.deepEqual(metadata, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(metadata), true);
});

test("generated Iyzico build metadata fails closed for every build or digest mismatch", async () => {
  const modulePath = "./build-binding.ts";
  const binding = await import(modulePath);
  const sourceManifest = binding.createIyzicoAdapterSourceManifest(SOURCE_BYTES);
  const expectedBuild = Object.freeze({ gitSha: "1".repeat(40), sourceManifest });
  const verified = binding.verifyIyzicoGeneratedBuildMetadata({ ...EXPECTED_METADATA }, expectedBuild);

  assert.deepEqual(verified, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(verified), true);

  for (const mismatch of [
    { ...EXPECTED_METADATA, buildMetadataSchemaVersion: 2 },
    { ...EXPECTED_METADATA, evidenceSchemaVersion: 2 },
    { ...EXPECTED_METADATA, providerCode: "paytr_iframe" },
    { ...EXPECTED_METADATA, capability: "credential_validation" },
    { ...EXPECTED_METADATA, environment: "live" },
    { ...EXPECTED_METADATA, adapterVersion: 2 },
    { ...EXPECTED_METADATA, gitSha: "2".repeat(40) },
    { ...EXPECTED_METADATA, sourceDigest: `sha256:${"2".repeat(64)}` },
    { ...EXPECTED_METADATA, candidateExecutionDigest: `sha256:${"3".repeat(64)}` },
    { ...EXPECTED_METADATA, browserApproved: true },
    Object.assign(Object.create(null), EXPECTED_METADATA),
    new Proxy({ ...EXPECTED_METADATA }, {}),
  ]) {
    assert.equal(
      binding.verifyIyzicoGeneratedBuildMetadata(mismatch, expectedBuild),
      null,
    );
  }
  assert.equal(binding.verifyIyzicoGeneratedBuildMetadata(
    { ...EXPECTED_METADATA },
    { ...expectedBuild, gitSha: "2".repeat(40) },
  ), null);
});

test("default generated metadata and approved authority remain null without immutable sandbox attestation", async () => {
  const generatedPath = "./build-metadata.generated.ts";
  const bindingPath = "./build-binding.ts";
  const [generated, binding] = await Promise.all([
    import(generatedPath).catch(() => null),
    import(bindingPath),
  ]);

  assert.ok(generated, "the generated build metadata contract must exist");
  assert.equal(generated.IYZICO_GENERATED_BUILD_METADATA, null);
  assert.equal(binding.IYZICO_APPROVED_EXECUTION_AUTHORITY, null);
  const candidate = binding.createIyzicoCandidateBuildMetadata({
    gitSha: "1".repeat(40),
    sourceManifest: binding.createIyzicoAdapterSourceManifest(SOURCE_BYTES),
  });
  assert.equal("executionAuthority" in candidate, false);
  assert.equal("evidenceDigest" in candidate, false);
  assert.equal("approved" in candidate, false);
});

test("payment-adapters public API exposes only candidate build binding and a null Iyzico approval", async () => {
  const publicPath = "../../index.ts";
  const api = await import(publicPath);

  assert.equal(api.IYZICO_GENERATED_BUILD_METADATA, null);
  assert.equal(api.IYZICO_APPROVED_EXECUTION_AUTHORITY, null);
  assert.deepEqual(
    api.createIyzicoCandidateBuildMetadata({
      gitSha: "1".repeat(40),
      sourceManifest: api.createIyzicoAdapterSourceManifest(SOURCE_BYTES),
    }),
    EXPECTED_METADATA,
  );
});
