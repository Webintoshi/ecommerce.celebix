import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";
import {
  AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES,
  AKBANK_GENERATED_BUILD_METADATA,
  type AkbankCandidateBuildMetadata,
  type AkbankExecutionAuthorityMap,
} from "./build-metadata.generated.ts";

export type {
  AkbankCandidateBuildMetadata,
  AkbankExecutionAuthorityMap,
} from "./build-metadata.generated.ts";

export const AKBANK_ADAPTER_SOURCE_PATHS = Object.freeze([
  "src/contracts.ts",
  "src/providers/akbank/adapter.ts",
  "src/providers/akbank/config.ts",
  "src/providers/akbank/packet.ts",
  "src/transport.ts",
  "src/validation.ts",
] as const);

export type AkbankAdapterSource = Readonly<{
  path: string;
  bytes: Uint8Array;
}>;

export type AkbankAdapterSourceManifest = Readonly<{
  schemaVersion: 1;
  files: readonly Readonly<{ path: string; sha256: string }>[];
  sourceDigest: string;
}>;

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
type AkbankSourceAdmission = Readonly<{sourceDigest: string; gitShas: Readonly<Record<"test" | "live", string>>}>;
// Root adds exact source/anchor pairs only after independent review. This list is
// deliberately empty until that review and the first candidate commit exist.
const REVIEWED_SOURCE_ADMISSIONS: readonly AkbankSourceAdmission[] = Object.freeze([]);

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function invalid(): never {
  throw new TypeError("akbank_build_binding_invalid");
}

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) ||
      nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
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
    if (error instanceof TypeError && error.message === "akbank_build_binding_invalid") throw error;
    return invalid();
  }
}

function environment(value: unknown): "test" | "live" {
  if (value === "test" || value === "live") return value;
  return invalid();
}

function exactSource(value: unknown): AkbankAdapterSource {
  const parsed = exactRecord(value, ["path", "bytes"]);
  if (
    typeof parsed.path !== "string" || nodeTypes.isProxy(parsed.bytes) ||
    !nodeTypes.isUint8Array(parsed.bytes) ||
    Object.getPrototypeOf(parsed.bytes) !== Uint8Array.prototype
  ) invalid();
  return Object.freeze({ path: parsed.path, bytes: parsed.bytes as Uint8Array });
}

export function createAkbankAdapterSourceManifest(
  sources: readonly AkbankAdapterSource[],
): AkbankAdapterSourceManifest {
  if (
    !Array.isArray(sources) || nodeTypes.isProxy(sources) ||
    Object.getPrototypeOf(sources) !== Array.prototype ||
    sources.length !== AKBANK_ADAPTER_SOURCE_PATHS.length
  ) invalid();
  const selected = new Map<string, AkbankAdapterSource>();
  for (const entry of sources) {
    const source = exactSource(entry);
    if (
      !AKBANK_ADAPTER_SOURCE_PATHS.includes(source.path as typeof AKBANK_ADAPTER_SOURCE_PATHS[number]) ||
      selected.has(source.path)
    ) invalid();
    selected.set(source.path, source);
  }
  const files = Object.freeze(AKBANK_ADAPTER_SOURCE_PATHS.map((path) => {
    const source = selected.get(path);
    if (!source) return invalid();
    return Object.freeze({ path, sha256: sha256(source.bytes) });
  }));
  return Object.freeze({
    schemaVersion: 1,
    files,
    sourceDigest: sha256(JSON.stringify({ schemaVersion: 1, files })),
  });
}

function exactSourceManifest(value: unknown): AkbankAdapterSourceManifest {
  const parsed = exactRecord(value, ["schemaVersion", "files", "sourceDigest"]);
  if (
    parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) ||
    nodeTypes.isProxy(parsed.files) || Object.getPrototypeOf(parsed.files) !== Array.prototype ||
    parsed.files.length !== AKBANK_ADAPTER_SOURCE_PATHS.length ||
    typeof parsed.sourceDigest !== "string" || !SHA256.test(parsed.sourceDigest)
  ) invalid();
  const files = Object.freeze(parsed.files.map((entry, index) => {
    const file = exactRecord(entry, ["path", "sha256"]);
    const expectedPath = AKBANK_ADAPTER_SOURCE_PATHS[index];
    if (
      file.path !== expectedPath || typeof file.sha256 !== "string" ||
      !SHA256.test(file.sha256)
    ) invalid();
    return Object.freeze({ path: expectedPath, sha256: file.sha256 });
  }));
  const sourceDigest = sha256(JSON.stringify({ schemaVersion: 1, files }));
  if (sourceDigest !== parsed.sourceDigest) invalid();
  return Object.freeze({ schemaVersion: 1, files, sourceDigest });
}

export function createAkbankCandidateBuildMetadata(input: Readonly<{
  environment: "test" | "live";
  gitSha: string;
  sourceManifest: AkbankAdapterSourceManifest;
}>): AkbankCandidateBuildMetadata {
  const parsed = exactRecord(input, ["environment", "gitSha", "sourceManifest"]);
  const selectedEnvironment = environment(parsed.environment);
  if (typeof parsed.gitSha !== "string" || !GIT_SHA.test(parsed.gitSha)) invalid();
  const sourceManifest = exactSourceManifest(parsed.sourceManifest);
  const candidate = Object.freeze({
    evidenceSchemaVersion: 1 as const,
    providerCode: "akbank_json" as const,
    capability: "payment_processing" as const,
    environment: selectedEnvironment,
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

export function verifyAkbankGeneratedBuildMetadata(
  value: unknown,
  expectedBuild: Readonly<{
    environment: "test" | "live";
    gitSha: string;
    sourceManifest: AkbankAdapterSourceManifest;
  }>,
): AkbankCandidateBuildMetadata | null {
  try {
    const expected = createAkbankCandidateBuildMetadata(expectedBuild);
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
    for (const key of Object.keys(expected) as (keyof AkbankCandidateBuildMetadata)[]) {
      if (parsed[key] !== expected[key]) return null;
    }
    return expected;
  } catch {
    return null;
  }
}

export function canonicalAkbankExecutionEvidenceDigest(candidate: AkbankCandidateBuildMetadata): string {
  const parsed = exactRecord(candidate, [
    "buildMetadataSchemaVersion", "evidenceSchemaVersion", "providerCode", "capability",
    "environment", "adapterVersion", "gitSha", "sourceDigest", "candidateExecutionDigest",
  ]);
  const selectedEnvironment = environment(parsed.environment);
  if (
    parsed.buildMetadataSchemaVersion !== 1 || parsed.evidenceSchemaVersion !== 1 ||
    parsed.providerCode !== "akbank_json" || parsed.capability !== "payment_processing" ||
    parsed.adapterVersion !== 1 || typeof parsed.gitSha !== "string" || !GIT_SHA.test(parsed.gitSha) ||
    typeof parsed.sourceDigest !== "string" || !SHA256.test(parsed.sourceDigest) ||
    typeof parsed.candidateExecutionDigest !== "string" || !SHA256.test(parsed.candidateExecutionDigest) ||
    parsed.candidateExecutionDigest !== sha256(JSON.stringify({
      evidenceSchemaVersion: parsed.evidenceSchemaVersion,
      providerCode: parsed.providerCode,
      capability: parsed.capability,
      environment: selectedEnvironment,
      adapterVersion: parsed.adapterVersion,
      gitSha: parsed.gitSha,
      sourceDigest: parsed.sourceDigest,
    }))
  ) invalid();
  const admission = REVIEWED_SOURCE_ADMISSIONS.find(entry => entry.sourceDigest === parsed.sourceDigest);
  if (admission === undefined) return parsed.candidateExecutionDigest;
  const anchor = admission.gitShas[selectedEnvironment];
  if (!GIT_SHA.test(anchor)) invalid();
  return sha256(JSON.stringify({
    evidenceSchemaVersion: 1,
    providerCode: "akbank_json",
    capability: "payment_processing",
    environment: selectedEnvironment,
    adapterVersion: 1,
    gitSha: anchor,
    sourceDigest: admission.sourceDigest,
  }));
}

function generatedExecutionAuthority(
  candidateValue: unknown,
  authorityValue: unknown,
  selectedEnvironment: "test" | "live",
): Readonly<PaymentProviderExecutionAuthority> | null {
  try {
    if (candidateValue === null && authorityValue === null) return null;
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
      candidate.buildMetadataSchemaVersion !== 1 || candidate.evidenceSchemaVersion !== 1 ||
      candidate.providerCode !== "akbank_json" || candidate.capability !== "payment_processing" ||
      candidate.environment !== selectedEnvironment || candidate.adapterVersion !== 1 ||
      typeof candidate.gitSha !== "string" || !GIT_SHA.test(candidate.gitSha) ||
      typeof candidate.sourceDigest !== "string" || !SHA256.test(candidate.sourceDigest) ||
      typeof candidate.candidateExecutionDigest !== "string" || !SHA256.test(candidate.candidateExecutionDigest) ||
      candidate.candidateExecutionDigest !== sha256(JSON.stringify({
        evidenceSchemaVersion: candidate.evidenceSchemaVersion,
        providerCode: candidate.providerCode,
        capability: candidate.capability,
        environment: candidate.environment,
        adapterVersion: candidate.adapterVersion,
        gitSha: candidate.gitSha,
        sourceDigest: candidate.sourceDigest,
      })) ||
      authority.environment !== selectedEnvironment || authority.adapterVersion !== 1 ||
      authority.evidenceDigest !== canonicalAkbankExecutionEvidenceDigest(candidateValue as AkbankCandidateBuildMetadata)
    ) return null;
    return Object.freeze({
      environment: selectedEnvironment,
      adapterVersion: 1,
      evidenceDigest: authority.evidenceDigest as string,
    });
  } catch {
    return null;
  }
}

export const AKBANK_APPROVED_EXECUTION_AUTHORITIES: AkbankExecutionAuthorityMap = Object.freeze({
  test: generatedExecutionAuthority(
    AKBANK_GENERATED_BUILD_METADATA.test,
    AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES.test,
    "test",
  ),
  live: generatedExecutionAuthority(
    AKBANK_GENERATED_BUILD_METADATA.live,
    AKBANK_GENERATED_APPROVED_EXECUTION_AUTHORITIES.live,
    "live",
  ),
});

export function resolveAkbankCompiledExecutionAuthority(selectedEnvironment: "test" | "live"): Readonly<PaymentProviderExecutionAuthority> | null {
  if (selectedEnvironment !== "test" && selectedEnvironment !== "live") return null;
  return AKBANK_APPROVED_EXECUTION_AUTHORITIES[selectedEnvironment];
}
