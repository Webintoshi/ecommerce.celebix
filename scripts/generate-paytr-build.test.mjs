import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const GENERATOR_PATH = join(REPOSITORY_ROOT, "scripts/generate-paytr-build.mjs");
const GENERATED_PATH = "packages/payment-adapters/src/providers/paytr/build-metadata.generated.ts";
const BINDING_PATH = "packages/payment-adapters/src/providers/paytr/build-binding.ts";
const SOURCE_COMMIT = "1".repeat(40);
const DIGESTS = Object.freeze({
  test: "sha256:05d98ed7af8c4ac4589d60b1d182bb16536415b0c59f3622b7cbe8de1e14e3e7",
  live: "sha256:558d1ae034512b3a0208c614f26d8044c1d34bbfc94767627b6093b283e6a9a6",
});
const SOURCE_TEXT = Object.freeze({
  "src/contracts.ts": "contracts-v1\n",
  "src/providers/paytr/adapter.ts": "adapter-v1\n",
  "src/providers/paytr/config.ts": "config-v1\n",
  "src/providers/paytr/packet.ts": "packet-v1\n",
  "src/transport.ts": "transport-v1\n",
  "src/validation.ts": "validation-v1\n",
});

async function fixture(t) {
  const root = await mkdtemp(join(REPOSITORY_ROOT, ".paytr-build-test-"));
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
        env: { NORMAL_BUILD_ENV: "must-not-leak", ...environment },
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

async function imported(path, key) {
  return import(`${pathToFileURL(path).href}?case=${key}`);
}

test("PayTR build generator writes both candidates and no authority by default", async (t) => {
  const selected = await fixture(t);
  const result = await runGenerator(selected.root, {
    SOURCE_COMMIT,
    CELEBIX_PAYTR_IFRAME_PANEL_MODE: "disabled",
    CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
    CELEBIX_PAYTR_STAGING_MERCHANT_ID: "runtime-only-fixture",
  });
  const generated = await imported(selected.generated, "closed");

  assert.deepEqual(result, {
    code: 0,
    stdout: `${DIGESTS.test} ${DIGESTS.live}\n`,
    stderr: "",
  });
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.test.candidateExecutionDigest, DIGESTS.test);
  assert.equal(generated.PAYTR_GENERATED_BUILD_METADATA.live.candidateExecutionDigest, DIGESTS.live);
  assert.deepEqual(generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES, {
    test: null,
    live: null,
  });
  assert.deepEqual(await runGenerator(selected.root, { SOURCE_COMMIT }, "--check"), result);
});

test("PayTR build generator emits exact independent test and live authorities", async (t) => {
  const selected = await fixture(t);
  const environment = {
    SOURCE_COMMIT,
    CELEBIX_PAYTR_TEST_APPROVAL_MODE: "approved_test_sandbox",
    CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST: DIGESTS.test,
    CELEBIX_PAYTR_LIVE_APPROVAL_MODE: "approved_live",
    CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST: DIGESTS.live,
  };
  assert.equal((await runGenerator(selected.root, environment)).code, 0);
  const generated = await imported(selected.generated, "approved-generated");
  const binding = await imported(selected.binding, "approved-binding");

  assert.deepEqual(generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES, {
    test: { environment: "test", adapterVersion: 1, evidenceDigest: DIGESTS.test },
    live: { environment: "live", adapterVersion: 1, evidenceDigest: DIGESTS.live },
  });
  assert.deepEqual(binding.PAYTR_APPROVED_EXECUTION_AUTHORITIES,
    generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES);
});

test("Coolify BuildKit secrets can supply missing PayTR build authorities without leaking values", async (t) => {
  const selected = await fixture(t);
  const secretDirectory = join(selected.root, "run-secrets");
  await mkdir(secretDirectory, { recursive: true });
  await writeFile(join(secretDirectory, "SOURCE_COMMIT"), `${SOURCE_COMMIT}\n`, "utf8");
  await writeFile(join(secretDirectory, "CELEBIX_PAYTR_TEST_APPROVAL_MODE"), "approved_test_sandbox\n", "utf8");
  await writeFile(
    join(secretDirectory, "CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST"),
    `${DIGESTS.test}\n`,
    "utf8",
  );
  await writeFile(join(secretDirectory, "CELEBIX_PAYTR_LIVE_APPROVAL_MODE"), "approved_live\n", "utf8");
  await writeFile(
    join(secretDirectory, "CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST"),
    `${DIGESTS.live}\n`,
    "utf8",
  );

  const result = await runGenerator(selected.root, { CELEBIX_BUILD_SECRETS_DIR: secretDirectory });
  assert.deepEqual(result, {
    code: 0,
    stdout: `${DIGESTS.test} ${DIGESTS.live}\n`,
    stderr: "",
  });
  const generated = await imported(selected.generated, "buildkit-secret-generated");

  assert.deepEqual(generated.PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES, {
    test: { environment: "test", adapterVersion: 1, evidenceDigest: DIGESTS.test },
    live: { environment: "live", adapterVersion: 1, evidenceDigest: DIGESTS.live },
  });
});

test("PayTR env authority is not rescued by matching BuildKit secrets", async (t) => {
  const selected = await fixture(t);
  const secretDirectory = join(selected.root, "run-secrets");
  await mkdir(secretDirectory, { recursive: true });
  await writeFile(join(secretDirectory, "SOURCE_COMMIT"), `${SOURCE_COMMIT}\n`, "utf8");
  await writeFile(join(secretDirectory, "CELEBIX_PAYTR_TEST_APPROVAL_MODE"), "approved_test_sandbox\n", "utf8");
  await writeFile(
    join(secretDirectory, "CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST"),
    `${DIGESTS.test}\n`,
    "utf8",
  );

  const result = await runGenerator(selected.root, {
    CELEBIX_BUILD_SECRETS_DIR: secretDirectory,
    SOURCE_COMMIT,
    CELEBIX_PAYTR_TEST_APPROVAL_MODE: "approved_live",
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^paytr_build_invalid\n$/);
  assert.equal(result.stderr.includes(DIGESTS.test), false);
});

test("PayTR build generator rejects partial wrong and unknown authority without replacing output", async (t) => {
  const cases = [
    {},
    { SOURCE_COMMIT: "A".repeat(40) },
    { SOURCE_COMMIT, CELEBIX_PAYTR_TEST_APPROVAL_MODE: "approved_test_sandbox" },
    { SOURCE_COMMIT, CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST: DIGESTS.live },
    {
      SOURCE_COMMIT,
      CELEBIX_PAYTR_TEST_APPROVAL_MODE: "approved_live",
      CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST: DIGESTS.test,
    },
    {
      SOURCE_COMMIT,
      CELEBIX_PAYTR_LIVE_APPROVAL_MODE: "approved_live",
      CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST: DIGESTS.test,
    },
    { SOURCE_COMMIT, CELEBIX_PAYTR_TEST_APPROVAL_UNEXPECTED: "private-extra" },
  ];
  for (const [index, environment] of cases.entries()) {
    const selected = await fixture(t);
    const sentinel = `sentinel-${index}\n`;
    await writeFile(selected.generated, sentinel, "utf8");
    const result = await runGenerator(selected.root, environment);
    assert.equal(result.code, 1, String(index));
    assert.match(result.stderr, /^paytr_build_invalid\n$/);
    assert.equal(result.stderr.includes("private-extra"), false);
    assert.equal(result.stderr.includes("must-not-leak"), false);
    assert.equal(await readFile(selected.generated, "utf8"), sentinel);
  }
});

test("Coolify payment builds generate PayTR and Iyzico bindings before compiling", async () => {
  const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  for (const name of [
    "build:coolify:customer-panel",
    "build:coolify:owner",
    "build:coolify:storefront-shared",
  ]) {
    assert.match(packageJson.scripts[name], /^npm run generate:iyzico-sandbox-build && npm run generate:paytr-build && /);
  }
});
