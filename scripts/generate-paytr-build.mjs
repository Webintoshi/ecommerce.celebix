import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { types as nodeTypes } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PAYTR_ADAPTER_SOURCE_PATHS,
  createPaytrAdapterSourceManifest,
  createPaytrCandidateBuildMetadata,
} from "../packages/payment-adapters/src/providers/paytr/build-binding.ts";

const GENERATED_PATH = "packages/payment-adapters/src/providers/paytr/build-metadata.generated.ts";
const GIT_SHA = /^[a-f0-9]{40}$/;
const APPROVAL_KEYS = Object.freeze({
  test: Object.freeze({
    mode: "CELEBIX_PAYTR_TEST_APPROVAL_MODE",
    digest: "CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST",
    expectedMode: "approved_test_sandbox",
  }),
  live: Object.freeze({
    mode: "CELEBIX_PAYTR_LIVE_APPROVAL_MODE",
    digest: "CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST",
    expectedMode: "approved_live",
  }),
});
const APPROVAL_KEY_PREFIXES = Object.freeze([
  "CELEBIX_PAYTR_TEST_APPROVAL_",
  "CELEBIX_PAYTR_TEST_APPROVED_",
  "CELEBIX_PAYTR_LIVE_APPROVAL_",
  "CELEBIX_PAYTR_LIVE_APPROVED_",
]);
const BUILD_SECRETS_DIRECTORY_KEY = "CELEBIX_BUILD_SECRETS_DIR";
const DEFAULT_BUILD_SECRETS_DIRECTORY = "/run/secrets";
const ALLOWED_ENVIRONMENT_KEYS = new Set([
  "SOURCE_COMMIT",
  APPROVAL_KEYS.test.mode,
  APPROVAL_KEYS.test.digest,
  APPROVAL_KEYS.live.mode,
  APPROVAL_KEYS.live.digest,
]);
const BUILD_SECRET_KEYS = Object.freeze([...ALLOWED_ENVIRONMENT_KEYS]);

function invalid() {
  throw new TypeError("paytr_build_invalid");
}

function exactRecord(value, keys) {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) ||
      nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))
    ) invalid();
    const selected = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      selected[key] = descriptor.value;
    }
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "paytr_build_invalid") throw error;
    return invalid();
  }
}

function selectedEnvironment(value) {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) ||
      nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const selected = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") invalid();
      if (
        key !== "SOURCE_COMMIT"
        && !APPROVAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) continue;
      if (!ALLOWED_ENVIRONMENT_KEYS.has(key)) invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) ||
        typeof descriptor.value !== "string") invalid();
      selected[key] = descriptor.value;
    }
    if (typeof selected.SOURCE_COMMIT !== "string" || !GIT_SHA.test(selected.SOURCE_COMMIT)) invalid();
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "paytr_build_invalid") throw error;
    return invalid();
  }
}

function runtimeEnvironment(value) {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) invalid();
    const selected = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") continue;
      if (
        key !== "SOURCE_COMMIT"
        && !APPROVAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") invalid();
      selected[key] = descriptor.value;
    }
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "paytr_build_invalid") throw error;
    return invalid();
  }
}

function buildSecretDirectory(value) {
  if (value === undefined) return DEFAULT_BUILD_SECRETS_DIRECTORY;
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) invalid();
  return value;
}

function normalizeBuildSecret(value) {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

async function environmentWithBuildSecrets(environment, directory) {
  const selected = { ...environment };
  for (const key of BUILD_SECRET_KEYS) {
    if (selected[key] !== undefined) continue;
    try {
      selected[key] = normalizeBuildSecret(await readFile(join(directory, key), "utf8"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      invalid();
    }
  }
  return Object.freeze(selected);
}

function approval(environment, selectedEnvironment, candidateDigest) {
  const keys = APPROVAL_KEYS[selectedEnvironment];
  const mode = environment[keys.mode];
  const evidenceDigest = environment[keys.digest];
  if (mode === undefined && evidenceDigest === undefined) return null;
  if (mode !== keys.expectedMode || evidenceDigest !== candidateDigest) invalid();
  return Object.freeze({ environment: selectedEnvironment, adapterVersion: 1, evidenceDigest });
}

function frozenLiteral(value) {
  return value === null ? "null" : `Object.freeze(${JSON.stringify(value, null, 2)})`;
}

function render(candidates, approvals) {
  return `import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";\n\n`
    + `export type PaytrCandidateBuildMetadata = Readonly<{\n`
    + `  buildMetadataSchemaVersion: 1;\n`
    + `  evidenceSchemaVersion: 1;\n`
    + `  providerCode: "paytr_iframe";\n`
    + `  capability: "payment_processing";\n`
    + `  environment: "test" | "live";\n`
    + `  adapterVersion: 1;\n`
    + `  gitSha: string;\n`
    + `  sourceDigest: string;\n`
    + `  candidateExecutionDigest: string;\n`
    + `}>;\n\n`
    + `export type PaytrGeneratedBuildMetadataMap = Readonly<{\n`
    + `  test: PaytrCandidateBuildMetadata | null;\n`
    + `  live: PaytrCandidateBuildMetadata | null;\n`
    + `}>;\n\n`
    + `export type PaytrExecutionAuthorityMap = Readonly<{\n`
    + `  test: Readonly<PaymentProviderExecutionAuthority> | null;\n`
    + `  live: Readonly<PaymentProviderExecutionAuthority> | null;\n`
    + `}>;\n\n`
    + `export const PAYTR_GENERATED_BUILD_METADATA: PaytrGeneratedBuildMetadataMap = Object.freeze({\n`
    + `  test: ${frozenLiteral(candidates.test)},\n`
    + `  live: ${frozenLiteral(candidates.live)},\n`
    + `});\n\n`
    + `export const PAYTR_GENERATED_APPROVED_EXECUTION_AUTHORITIES: PaytrExecutionAuthorityMap = Object.freeze({\n`
    + `  test: ${frozenLiteral(approvals.test)},\n`
    + `  live: ${frozenLiteral(approvals.live)},\n`
    + `});\n`;
}

async function atomicWrite(path, bytes) {
  const temporary = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o644);
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}

export async function generatePaytrBuild(value) {
  const parsed = exactRecord(value, ["repositoryRoot", "environment", "check"]);
  if (
    typeof parsed.repositoryRoot !== "string" || !isAbsolute(parsed.repositoryRoot) ||
    resolve(parsed.repositoryRoot) !== parsed.repositoryRoot ||
    (parsed.check !== true && parsed.check !== false)
  ) invalid();
  const environment = selectedEnvironment(parsed.environment);
  const packageRoot = join(parsed.repositoryRoot, "packages/payment-adapters");
  const sources = [];
  try {
    for (const path of PAYTR_ADAPTER_SOURCE_PATHS) {
      const sourcePath = join(packageRoot, path);
      const status = await lstat(sourcePath);
      if (!status.isFile() || status.isSymbolicLink()) invalid();
      sources.push(Object.freeze({ path, bytes: new Uint8Array(await readFile(sourcePath)) }));
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === "paytr_build_invalid") throw error;
    return invalid();
  }
  const sourceManifest = createPaytrAdapterSourceManifest(Object.freeze(sources));
  const candidates = Object.freeze({
    test: createPaytrCandidateBuildMetadata(Object.freeze({
      environment: "test",
      gitSha: environment.SOURCE_COMMIT,
      sourceManifest,
    })),
    live: createPaytrCandidateBuildMetadata(Object.freeze({
      environment: "live",
      gitSha: environment.SOURCE_COMMIT,
      sourceManifest,
    })),
  });
  const approvals = Object.freeze({
    test: approval(environment, "test", candidates.test.candidateExecutionDigest),
    live: approval(environment, "live", candidates.live.candidateExecutionDigest),
  });
  const output = render(candidates, approvals);
  const generatedPath = join(parsed.repositoryRoot, GENERATED_PATH);
  if (parsed.check) {
    let current;
    try {
      current = await readFile(generatedPath, "utf8");
    } catch {
      return invalid();
    }
    if (current !== output) invalid();
  } else {
    await atomicWrite(generatedPath, output);
  }
  return candidates;
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === "--check") return true;
  return invalid();
}

async function main() {
  try {
    const directory = buildSecretDirectory(process.env[BUILD_SECRETS_DIRECTORY_KEY]);
    const candidates = await generatePaytrBuild(Object.freeze({
      repositoryRoot: process.cwd(),
      environment: await environmentWithBuildSecrets(runtimeEnvironment(process.env), directory),
      check: parseArguments(process.argv.slice(2)),
    }));
    process.stdout.write(`${candidates.test.candidateExecutionDigest} ${candidates.live.candidateExecutionDigest}\n`);
  } catch {
    process.stderr.write("paytr_build_invalid\n");
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invoked === pathToFileURL(fileURLToPath(import.meta.url)).href) await main();
