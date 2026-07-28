import { createHash } from "node:crypto";

import type { IyzicoCandidateBuildMetadata } from "@celebix/payment-adapters";
import type {
  IyzicoSandboxEvidenceActivationAppRepository,
  MerchantProviderProfileRepository,
} from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

type CurrentEvidenceRepository = Readonly<Pick<
  IyzicoSandboxEvidenceActivationAppRepository,
  "beginCurrent" | "current" | "activateCurrent" | "activationRuntimePreflight"
>>;
type ProfileReader = Readonly<Pick<MerchantProviderProfileRepository, "list">>;

export type ServerIyzicoActivationRuntime = Readonly<{
  access: ApprovedAccess;
  evidence: CurrentEvidenceRepository;
  profiles: ProfileReader;
  build: IyzicoCandidateBuildMetadata | null;
}>;

const EVIDENCE_METHODS = Object.freeze([
  "beginCurrent", "current", "activateCurrent", "activationRuntimePreflight",
] as const);
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, Omit<ServerIyzicoActivationRuntime, "access">>();
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

function invalid(): never {
  throw new Error("server_iyzico_activation_runtime_invalid");
}

function facade(repository: IyzicoSandboxEvidenceActivationAppRepository): CurrentEvidenceRepository {
  if (!repository || typeof repository !== "object" || EVIDENCE_METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(EVIDENCE_METHODS.map((method) => [
    method,
    repository[method].bind(repository),
  ])) as CurrentEvidenceRepository);
}

function profileFacade(repository: MerchantProviderProfileRepository): ProfileReader {
  if (!repository || typeof repository !== "object" || typeof repository.list !== "function") invalid();
  return Object.freeze({ list: repository.list.bind(repository) });
}

function buildMetadata(value: IyzicoCandidateBuildMetadata | null): IyzicoCandidateBuildMetadata | null {
  try {
    if (value === null) return null;
    if (typeof value !== "object" || !Object.isFrozen(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
    const keys = [
      "buildMetadataSchemaVersion", "evidenceSchemaVersion", "providerCode", "capability",
      "environment", "adapterVersion", "gitSha", "sourceDigest", "candidateExecutionDigest",
    ] as const;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })) invalid();
    if (
      value.buildMetadataSchemaVersion !== 1 || value.evidenceSchemaVersion !== 1
      || value.providerCode !== "iyzico_iframe" || value.capability !== "payment_processing"
      || value.environment !== "test" || value.adapterVersion !== 1
      || !GIT_SHA.test(value.gitSha) || !SHA256.test(value.sourceDigest)
      || !SHA256.test(value.candidateExecutionDigest)
    ) invalid();
    const candidate = Object.freeze({
      evidenceSchemaVersion: 1,
      providerCode: "iyzico_iframe",
      capability: "payment_processing",
      environment: "test",
      adapterVersion: 1,
      gitSha: value.gitSha,
      sourceDigest: value.sourceDigest,
    });
    const digest = `sha256:${createHash("sha256").update(JSON.stringify(candidate)).digest("hex")}`;
    if (digest !== value.candidateExecutionDigest) invalid();
    return Object.freeze({
      buildMetadataSchemaVersion: 1,
      ...candidate,
      candidateExecutionDigest: digest,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "server_iyzico_activation_runtime_invalid") throw error;
    return invalid();
  }
}

export function registerServerIyzicoActivationRuntime(
  access: ServerPanelAccessRuntime,
  evidence: IyzicoSandboxEvidenceActivationAppRepository,
  profiles: MerchantProviderProfileRepository,
  build: IyzicoCandidateBuildMetadata | null,
): void {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || RUNTIMES.has(access)) invalid();
    RUNTIMES.set(access, Object.freeze({
      evidence: facade(evidence),
      profiles: profileFacade(profiles),
      build: buildMetadata(build),
    }));
  } catch { invalid(); }
}

export function resolveServerIyzicoActivationRuntime(
  access: ServerPanelAccessRuntime,
): ServerIyzicoActivationRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const runtime = RUNTIMES.get(access);
    return runtime === undefined ? null : Object.freeze({
      access: access as ApprovedAccess,
      evidence: runtime.evidence,
      profiles: runtime.profiles,
      build: runtime.build,
    });
  } catch { return null; }
}
