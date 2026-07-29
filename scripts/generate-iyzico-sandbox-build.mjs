import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { types as nodeTypes } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IYZICO_ADAPTER_SOURCE_PATHS,
  createIyzicoAdapterSourceManifest,
  createIyzicoCandidateBuildMetadata,
} from "../packages/payment-adapters/src/providers/iyzico/build-binding.ts";

const GENERATED_PATH = "packages/payment-adapters/src/providers/iyzico/build-metadata.generated.ts";
const GIT_SHA = /^[a-f0-9]{40}$/;
const APPROVAL_MODE = "approved_test_sandbox";
const APPROVAL_MODE_KEY = "CELEBIX_IYZICO_APPROVAL_MODE";
const APPROVAL_DIGEST_KEY = "CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST";
const APPROVAL_PREFIX = "CELEBIX_IYZICO_";

function invalid() {
  throw new TypeError("iyzico_sandbox_build_invalid");
}

function exactRecord(value, keys) {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    if (
      actual.length !== keys.length
      || actual.some((key) => typeof key !== "string" || !keys.includes(key))
    ) invalid();
    const selected = Object.create(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      selected[key] = descriptor.value;
    }
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_sandbox_build_invalid") throw error;
    return invalid();
  }
}

function selectedEnvironment(value) {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) invalid();
    const selected = Object.create(null);
    for (const key of keys) {
      if (key !== "SOURCE_COMMIT" && !key.startsWith(APPROVAL_PREFIX)) continue;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)
        || typeof descriptor.value !== "string") invalid();
      if (
        key !== "SOURCE_COMMIT"
        && key !== APPROVAL_MODE_KEY
        && key !== APPROVAL_DIGEST_KEY
      ) invalid();
      selected[key] = descriptor.value;
    }
    if (typeof selected.SOURCE_COMMIT !== "string" || !GIT_SHA.test(selected.SOURCE_COMMIT)) {
      invalid();
    }
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_sandbox_build_invalid") throw error;
    return invalid();
  }
}

function runtimeEnvironment(value) {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) invalid();
    const selected = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") continue;
      if (key !== "SOURCE_COMMIT" && !key.startsWith(APPROVAL_PREFIX)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") invalid();
      selected[key] = descriptor.value;
    }
    return Object.freeze(selected);
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_sandbox_build_invalid") throw error;
    return invalid();
  }
}

function approval(environment, candidateDigest) {
  const mode = environment[APPROVAL_MODE_KEY];
  const evidenceDigest = environment[APPROVAL_DIGEST_KEY];
  if (mode === undefined && evidenceDigest === undefined) return null;
  if (mode !== APPROVAL_MODE || evidenceDigest !== candidateDigest) invalid();
  return Object.freeze({ environment: "test", adapterVersion: 1, evidenceDigest });
}

function render(candidate, selectedApproval) {
  const metadata = JSON.stringify(candidate, null, 2);
  const authority = selectedApproval === null
    ? "null"
    : `Object.freeze(${JSON.stringify(selectedApproval, null, 2)})`;
  return `import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";\n\n`
    + `export type IyzicoCandidateBuildMetadata = Readonly<{\n`
    + `  buildMetadataSchemaVersion: 1;\n`
    + `  evidenceSchemaVersion: 1;\n`
    + `  providerCode: "iyzico_iframe";\n`
    + `  capability: "payment_processing";\n`
    + `  environment: "test";\n`
    + `  adapterVersion: 1;\n`
    + `  gitSha: string;\n`
    + `  sourceDigest: string;\n`
    + `  candidateExecutionDigest: string;\n`
    + `}>;\n\n`
    + `export const IYZICO_GENERATED_BUILD_METADATA:\n`
    + `  IyzicoCandidateBuildMetadata | null = Object.freeze(${metadata});\n\n`
    + `export const IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY:\n`
    + `  Readonly<PaymentProviderExecutionAuthority> | null = ${authority};\n`;
}

async function atomicWrite(path, bytes) {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`,
  );
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

export async function generateIyzicoSandboxBuild(value) {
  const parsed = exactRecord(value, ["repositoryRoot", "environment", "check"]);
  if (
    typeof parsed.repositoryRoot !== "string"
    || !isAbsolute(parsed.repositoryRoot)
    || resolve(parsed.repositoryRoot) !== parsed.repositoryRoot
    || parsed.check !== true && parsed.check !== false
  ) invalid();
  const environment = selectedEnvironment(parsed.environment);
  const packageRoot = join(parsed.repositoryRoot, "packages/payment-adapters");
  const sources = [];
  try {
    for (const path of IYZICO_ADAPTER_SOURCE_PATHS) {
      const sourcePath = join(packageRoot, path);
      const status = await lstat(sourcePath);
      if (!status.isFile() || status.isSymbolicLink()) invalid();
      sources.push(Object.freeze({ path, bytes: new Uint8Array(await readFile(sourcePath)) }));
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_sandbox_build_invalid") throw error;
    return invalid();
  }
  const sourceManifest = createIyzicoAdapterSourceManifest(Object.freeze(sources));
  const candidate = createIyzicoCandidateBuildMetadata(Object.freeze({
    gitSha: environment.SOURCE_COMMIT,
    sourceManifest,
  }));
  const output = render(candidate, approval(environment, candidate.candidateExecutionDigest));
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
  return candidate;
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === "--check") return true;
  return invalid();
}

async function main() {
  try {
    const candidate = await generateIyzicoSandboxBuild(Object.freeze({
      repositoryRoot: process.cwd(),
      environment: runtimeEnvironment(process.env),
      check: parseArguments(process.argv.slice(2)),
    }));
    process.stdout.write(`${candidate.candidateExecutionDigest}\n`);
  } catch {
    process.stderr.write("iyzico_sandbox_build_invalid\n");
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] === undefined
  ? null
  : pathToFileURL(resolve(process.argv[1])).href;
if (invoked === pathToFileURL(fileURLToPath(import.meta.url)).href) await main();
