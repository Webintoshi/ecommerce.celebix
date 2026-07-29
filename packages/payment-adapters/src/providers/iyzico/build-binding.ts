import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";
import {
  IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY,
  IYZICO_GENERATED_BUILD_METADATA,
  type IyzicoCandidateBuildMetadata,
} from "./build-metadata.generated.ts";

export type { IyzicoCandidateBuildMetadata } from "./build-metadata.generated.ts";

export const IYZICO_ADAPTER_SOURCE_PATHS = Object.freeze([
  "src/contracts.ts",
  "src/providers/iyzico/adapter.ts",
  "src/providers/iyzico/config.ts",
  "src/providers/iyzico/packet.ts",
  "src/transport.ts",
  "src/validation.ts",
] as const);

export type IyzicoAdapterSource = Readonly<{
  path: string;
  bytes: Uint8Array;
}>;

export type IyzicoAdapterSourceManifest = Readonly<{
  schemaVersion: 1;
  files: readonly Readonly<{
    path: string;
    sha256: string;
  }>[];
  sourceDigest: string;
}>;

type ExactRecord = Readonly<Record<string, unknown>>;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function invalid(): never {
  throw new TypeError("iyzico_build_binding_invalid");
}

function exactRecord(value: unknown, keys: readonly string[]): ExactRecord {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== keys.length) invalid();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_build_binding_invalid") throw error;
    return invalid();
  }
}

function exactSource(value: unknown): IyzicoAdapterSource {
  try {
    const parsed = exactRecord(value, ["path", "bytes"]);
    if (typeof parsed.path !== "string" || nodeTypes.isProxy(parsed.bytes)
      || !nodeTypes.isUint8Array(parsed.bytes)
      || Object.getPrototypeOf(parsed.bytes) !== Uint8Array.prototype) invalid();
    return Object.freeze({ path: parsed.path, bytes: parsed.bytes as Uint8Array });
  } catch (error) {
    if (error instanceof TypeError && error.message === "iyzico_build_binding_invalid") throw error;
    return invalid();
  }
}

function generatedExecutionAuthority(
  candidateValue: unknown,
  authorityValue: unknown,
): Readonly<PaymentProviderExecutionAuthority> | null {
  try {
    if (authorityValue === null) return null;
    const candidate = exactRecord(candidateValue, [
      "buildMetadataSchemaVersion",
      "evidenceSchemaVersion",
      "providerCode",
      "capability",
      "environment",
      "adapterVersion",
      "gitSha",
      "sourceDigest",
      "candidateExecutionDigest",
    ]);
    const authority = exactRecord(authorityValue, [
      "environment",
      "adapterVersion",
      "evidenceDigest",
    ]);
    if (
      candidate.buildMetadataSchemaVersion !== 1
      || candidate.evidenceSchemaVersion !== 1
      || candidate.providerCode !== "iyzico_iframe"
      || candidate.capability !== "payment_processing"
      || candidate.environment !== "test"
      || candidate.adapterVersion !== 1
      || typeof candidate.gitSha !== "string"
      || !GIT_SHA.test(candidate.gitSha)
      || typeof candidate.sourceDigest !== "string"
      || !SHA256.test(candidate.sourceDigest)
      || typeof candidate.candidateExecutionDigest !== "string"
      || !SHA256.test(candidate.candidateExecutionDigest)
      || candidate.candidateExecutionDigest !== sha256(JSON.stringify({
        evidenceSchemaVersion: candidate.evidenceSchemaVersion,
        providerCode: candidate.providerCode,
        capability: candidate.capability,
        environment: candidate.environment,
        adapterVersion: candidate.adapterVersion,
        gitSha: candidate.gitSha,
        sourceDigest: candidate.sourceDigest,
      }))
      || authority.environment !== "test"
      || authority.adapterVersion !== 1
      || authority.evidenceDigest !== candidate.candidateExecutionDigest
    ) return null;
    return Object.freeze({
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: authority.evidenceDigest,
    });
  } catch {
    return null;
  }
}

export const IYZICO_APPROVED_EXECUTION_AUTHORITY = generatedExecutionAuthority(
  IYZICO_GENERATED_BUILD_METADATA,
  IYZICO_GENERATED_APPROVED_EXECUTION_AUTHORITY,
);

export function createIyzicoAdapterSourceManifest(
  sources: readonly IyzicoAdapterSource[],
): IyzicoAdapterSourceManifest {
  if (!Array.isArray(sources) || nodeTypes.isProxy(sources)
    || Object.getPrototypeOf(sources) !== Array.prototype
    || sources.length !== IYZICO_ADAPTER_SOURCE_PATHS.length) invalid();
  const selected = new Map<string, IyzicoAdapterSource>();
  for (const entry of sources) {
    const source = exactSource(entry);
    if (!IYZICO_ADAPTER_SOURCE_PATHS.includes(source.path as typeof IYZICO_ADAPTER_SOURCE_PATHS[number])
      || selected.has(source.path)) invalid();
    selected.set(source.path, source);
  }
  const files = Object.freeze(IYZICO_ADAPTER_SOURCE_PATHS.map((path) => {
    const source = selected.get(path);
    if (!source) return invalid();
    return Object.freeze({ path, sha256: sha256(source.bytes) });
  }));
  const canonical = JSON.stringify({ schemaVersion: 1, files });
  return Object.freeze({
    schemaVersion: 1,
    files,
    sourceDigest: sha256(canonical),
  });
}

function exactSourceManifest(value: unknown): IyzicoAdapterSourceManifest {
  const parsed = exactRecord(value, ["schemaVersion", "files", "sourceDigest"]);
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) || nodeTypes.isProxy(parsed.files)
    || Object.getPrototypeOf(parsed.files) !== Array.prototype
    || parsed.files.length !== IYZICO_ADAPTER_SOURCE_PATHS.length
    || typeof parsed.sourceDigest !== "string" || !SHA256.test(parsed.sourceDigest)) invalid();
  const files = Object.freeze(parsed.files.map((entry, index) => {
    const file = exactRecord(entry, ["path", "sha256"]);
    const expectedPath = IYZICO_ADAPTER_SOURCE_PATHS[index];
    if (typeof file.path !== "string" || file.path !== expectedPath
      || typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) invalid();
    return Object.freeze({ path: expectedPath, sha256: file.sha256 });
  }));
  const sourceDigest = sha256(JSON.stringify({ schemaVersion: 1, files }));
  if (sourceDigest !== parsed.sourceDigest) invalid();
  return Object.freeze({ schemaVersion: 1, files, sourceDigest });
}

export function createIyzicoCandidateBuildMetadata(input: Readonly<{
  gitSha: string;
  sourceManifest: IyzicoAdapterSourceManifest;
}>): IyzicoCandidateBuildMetadata {
  const parsed = exactRecord(input, ["gitSha", "sourceManifest"]);
  if (typeof parsed.gitSha !== "string" || !GIT_SHA.test(parsed.gitSha)) invalid();
  const sourceManifest = exactSourceManifest(parsed.sourceManifest);
  const candidate = Object.freeze({
    evidenceSchemaVersion: 1 as const,
    providerCode: "iyzico_iframe" as const,
    capability: "payment_processing" as const,
    environment: "test" as const,
    adapterVersion: 1 as const,
    gitSha: parsed.gitSha,
    sourceDigest: sourceManifest.sourceDigest,
  });
  return Object.freeze({
    buildMetadataSchemaVersion: 1,
    ...candidate,
    candidateExecutionDigest: sha256(JSON.stringify(candidate)),
  });
}

export function verifyIyzicoGeneratedBuildMetadata(
  value: unknown,
  expectedBuild: Readonly<{
    gitSha: string;
    sourceManifest: IyzicoAdapterSourceManifest;
  }>,
): IyzicoCandidateBuildMetadata | null {
  try {
    const expected = createIyzicoCandidateBuildMetadata(expectedBuild);
    const parsed = exactRecord(value, [
      "buildMetadataSchemaVersion",
      "evidenceSchemaVersion",
      "providerCode",
      "capability",
      "environment",
      "adapterVersion",
      "gitSha",
      "sourceDigest",
      "candidateExecutionDigest",
    ]);
    for (const key of Object.keys(expected) as (keyof IyzicoCandidateBuildMetadata)[]) {
      if (parsed[key] !== expected[key]) return null;
    }
    return expected;
  } catch {
    return null;
  }
}
