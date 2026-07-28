import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const GENERATOR_PATH = join(REPOSITORY_ROOT, "scripts/generate-iyzico-sandbox-build.mjs");
const GENERATED_PATH = "packages/payment-adapters/src/providers/iyzico/build-metadata.generated.ts";
const BINDING_PATH = "packages/payment-adapters/src/providers/iyzico/build-binding.ts";
const SOURCE_COMMIT = "1".repeat(40);
const CANDIDATE_DIGEST = "sha256:1ad2b0fbdef7156531ba2cfd181674e3f989f83e634d354b5603a49896ea348a";
const SOURCE_TEXT = Object.freeze({
  "src/contracts.ts": "contracts-v1\n",
  "src/providers/iyzico/adapter.ts": "adapter-v1\n",
  "src/providers/iyzico/config.ts": "config-v1\n",
  "src/providers/iyzico/packet.ts": "packet-v1\n",
  "src/transport.ts": "transport-v1\n",
  "src/validation.ts": "validation-v1\n",
});
const EXPECTED_METADATA = Object.freeze({
  buildMetadataSchemaVersion: 1,
  evidenceSchemaVersion: 1,
  providerCode: "iyzico_iframe",
  capability: "payment_processing",
  environment: "test",
  adapterVersion: 1,
  gitSha: SOURCE_COMMIT,
  sourceDigest: "sha256:6280412d2060bc30bc1c119afeff66791521bd95db6ec37791ec2d54917ad5ee",
  candidateExecutionDigest: CANDIDATE_DIGEST,
});

async function fixture(t) {
  const root = await mkdtemp(join(REPOSITORY_ROOT, ".iyzico-build-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  for (const [path, text] of Object.entries(SOURCE_TEXT)) {
    const target = join(root, "packages/payment-adapters", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text, "utf8");
  }
  const generated = join(root, GENERATED_PATH);
  const binding = join(root, BINDING_PATH);
  await mkdir(dirname(generated), { recursive: true });
  await copyFile(join(REPOSITORY_ROOT, BINDING_PATH), binding);
  return Object.freeze({ root, generated, binding });
}

async function runGenerator(root, environment, ...arguments_) {
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", GENERATOR_PATH, ...arguments_],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          NORMAL_BUILD_ENV: "must-not-be-read-or-printed",
          ...environment,
        },
      },
    );
    return Object.freeze({ code: 0, stdout: result.stdout, stderr: result.stderr });
  } catch (error) {
    return Object.freeze({
      code: typeof error.code === "number" ? error.code : -1,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
    });
  }
}

async function imported(path, cacheKey) {
  return import(`${pathToFileURL(path).href}?case=${cacheKey}`);
}

test("Build A deterministically writes exact candidate metadata with null approval and supports drift check", async (t) => {
  const selected = await fixture(t);
  const environment = Object.freeze({ SOURCE_COMMIT });

  const first = await runGenerator(selected.root, environment);
  const firstBytes = await readFile(selected.generated, "utf8");
  const generated = await imported(selected.generated, "build-a");

  assert.deepEqual(first, { code: 0, stdout: `${CANDIDATE_DIGEST}\n`, stderr: "" });
  assert.deepEqual(generated.IYZICO_GENERATED_BUILD_METADATA, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(generated.IYZICO_GENERATED_BUILD_METADATA), true);
  assert.equal(generated.IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY, null);

  const second = await runGenerator(selected.root, environment);
  assert.deepEqual(second, first);
  assert.equal(await readFile(selected.generated, "utf8"), firstBytes);
  assert.deepEqual(await runGenerator(selected.root, environment, "--check"), first);
  assert.equal(
    (await readdir(dirname(selected.generated))).some((name) => name.includes(".tmp-")),
    false,
  );

  await writeFile(
    join(selected.root, "packages/payment-adapters/src/providers/iyzico/adapter.ts"),
    "adapter-v2\n",
    "utf8",
  );
  const drift = await runGenerator(selected.root, environment, "--check");
  assert.equal(drift.code, 1);
  assert.equal(drift.stdout, "");
  assert.match(drift.stderr, /^iyzico_sandbox_build_invalid\n$/);
  assert.equal(await readFile(selected.generated, "utf8"), firstBytes);
});

test("Build B emits a test-only authority only for exact mode and candidate digest", async (t) => {
  const selected = await fixture(t);
  const result = await runGenerator(selected.root, {
    SOURCE_COMMIT,
    CELEBIX_IYZICO_APPROVAL_MODE: "approved_test_sandbox",
    CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST: CANDIDATE_DIGEST,
  });
  const generated = await imported(selected.generated, "build-b-generated");
  const binding = await imported(selected.binding, "build-b-binding");
  const authority = Object.freeze({
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: CANDIDATE_DIGEST,
  });

  assert.deepEqual(result, { code: 0, stdout: `${CANDIDATE_DIGEST}\n`, stderr: "" });
  assert.deepEqual(generated.IYZICO_GENERATED_BUILD_METADATA, EXPECTED_METADATA);
  assert.deepEqual(generated.IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY, authority);
  assert.equal(Object.isFrozen(generated.IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY), true);
  assert.deepEqual(binding.IYZICO_APPROVED_EXECUTION_AUTHORITY, authority);
  assert.equal(Object.isFrozen(binding.IYZICO_APPROVED_EXECUTION_AUTHORITY), true);
});

test("partial wrong live extra and missing build authority fail closed without replacing output", async (t) => {
  const cases = [
    Object.freeze({}),
    Object.freeze({ SOURCE_COMMIT: "A".repeat(40) }),
    Object.freeze({ SOURCE_COMMIT, CELEBIX_IYZICO_APPROVAL_MODE: "approved_test_sandbox" }),
    Object.freeze({ SOURCE_COMMIT, CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST: CANDIDATE_DIGEST }),
    Object.freeze({
      SOURCE_COMMIT,
      CELEBIX_IYZICO_APPROVAL_MODE: "approved_test_sandbox",
      CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST: `sha256:${"2".repeat(64)}`,
    }),
    Object.freeze({
      SOURCE_COMMIT,
      CELEBIX_IYZICO_APPROVAL_MODE: "approved_live",
      CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST: CANDIDATE_DIGEST,
    }),
    Object.freeze({
      SOURCE_COMMIT,
      CELEBIX_IYZICO_UNEXPECTED_AUTHORITY: "private-extra-authority",
    }),
  ];

  for (const [index, environment] of cases.entries()) {
    const selected = await fixture(t);
    const sentinel = `existing-generated-output-${index}\n`;
    await writeFile(selected.generated, sentinel, "utf8");
    const result = await runGenerator(selected.root, environment);

    assert.equal(result.code, 1, String(index));
    assert.equal(result.stdout, "", String(index));
    assert.match(result.stderr, /^iyzico_sandbox_build_invalid\n$/, String(index));
    assert.equal(result.stderr.includes("private-extra-authority"), false);
    assert.equal(result.stderr.includes("must-not-be-read-or-printed"), false);
    assert.equal(await readFile(selected.generated, "utf8"), sentinel);
  }
});

test("missing exact source and hostile prototype or proxy input are rejected", async (t) => {
  const selected = await fixture(t);
  await unlink(join(selected.root, "packages/payment-adapters/src/validation.ts"));
  const missing = await runGenerator(selected.root, { SOURCE_COMMIT });
  assert.equal(missing.code, 1);
  assert.equal(missing.stdout, "");

  const generator = await import(`${pathToFileURL(GENERATOR_PATH).href}?core=hostile`);
  for (const environment of [
    Object.create({ SOURCE_COMMIT }),
    new Proxy({ SOURCE_COMMIT }, {}),
  ]) {
    await assert.rejects(
      () => generator.generateIyzicoSandboxBuild(Object.freeze({
        repositoryRoot: selected.root,
        environment,
        check: false,
      })),
      /iyzico_sandbox_build_invalid/,
    );
  }
});

test("Coolify application builds generate the commit-bound Iyzico metadata before compiling", async () => {
  const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.deepEqual(
    {
      customerPanel: packageJson.scripts["build:coolify:customer-panel"],
      owner: packageJson.scripts["build:coolify:owner"],
      storefrontShared: packageJson.scripts["build:coolify:storefront-shared"],
    },
    {
      customerPanel: "npm run generate:iyzico-sandbox-build && npm run build --workspace @celebix/customer-panel",
      owner: "npm run generate:iyzico-sandbox-build && npm run build --workspace @celebix/owner",
      storefrontShared: "npm run generate:iyzico-sandbox-build && npm run build --workspace @celebix/storefront-shared",
    },
  );
});
