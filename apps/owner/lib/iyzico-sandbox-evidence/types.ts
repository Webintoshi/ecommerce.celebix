import type {
  HostedPaymentAdapter,
  HostedPaymentInitialization,
  HostedPaymentInitializeInput,
  IyzicoCredential,
} from "@celebix/payment-adapters";
import type {
  IyzicoSandboxEvidenceAppRepository,
  IyzicoSandboxEvidenceWorkflowRepository,
} from "@celebix/saas-data";
import type { TenantContext } from "@celebix/saas-contracts";

export type IyzicoSandboxEvidenceCaseKind =
  | "success"
  | "decline"
  | "controlled_timeout_recovery"
  | "callback_replay";

export type IyzicoSandboxEvidenceCandidateResolution =
  | Readonly<{
      kind: "ready";
      adapterVersion: 1;
      evidenceDigest: string;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: "candidate_missing" | "candidate_stale";
    }>;

export type IyzicoSandboxEvidenceProfileResolution =
  | Readonly<{
      kind: "ready";
      profileId: string;
      profileVersion: number;
      credentialVersion: number;
      credentialAuthority: object;
    }>
  | Readonly<{
      kind: "unavailable";
      reason:
        | "profile_missing"
        | "profile_stale"
        | "credential_missing"
        | "credential_stale";
    }>;

export type IyzicoSandboxEvidenceInitializationFixture = Omit<
  HostedPaymentInitializeInput<IyzicoCredential>,
  "environment" | "credential" | "attemptId" | "signal"
>;

export type IyzicoSandboxEvidenceRawCallback = Readonly<{
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}>;

export interface IyzicoSandboxEvidenceMemoryOperator {
  initialization(input: Readonly<{
    caseKind: IyzicoSandboxEvidenceCaseKind;
    attemptId: string;
  }>): Promise<IyzicoSandboxEvidenceInitializationFixture>;
  callback(input: Readonly<{
    caseKind: IyzicoSandboxEvidenceCaseKind;
    initialization: Extract<HostedPaymentInitialization, Readonly<{ kind: "iframe" }>>;
  }>): Promise<IyzicoSandboxEvidenceRawCallback>;
  controlledTimeout(): Promise<Readonly<{
    kind: "controlled_timeout_observed";
    signal: AbortSignal;
  }>>;
}

export type IyzicoSandboxEvidenceOperatorOptions = Readonly<{
  appRepository: IyzicoSandboxEvidenceAppRepository;
  workflowRepository: IyzicoSandboxEvidenceWorkflowRepository;
  candidateResolver(): Promise<IyzicoSandboxEvidenceCandidateResolution>;
  profileResolver(input: Readonly<{
    tenantContext: TenantContext;
    profileId: string;
    now: Date;
  }>): Promise<IyzicoSandboxEvidenceProfileResolution>;
  adapterResolver(): Promise<HostedPaymentAdapter<IyzicoCredential>>;
  credentialResolver(input: Readonly<{
    credentialAuthority: object;
    profileId: string;
    profileVersion: number;
    credentialVersion: number;
    runId: string;
    leaseId: string;
  }>): Promise<IyzicoCredential>;
  operator: IyzicoSandboxEvidenceMemoryOperator;
  now(): Date;
  leaseDurationMs: number;
}>;

export type IyzicoSandboxEvidenceOperatorInput = Readonly<{
  tenantContext: TenantContext;
  profileId: string;
  runId: string;
  leaseId: string;
  attestationId: string;
  workerId: string;
  eventIds: Readonly<{
    successCaptured: string;
    declined: string;
    timeoutUnknown: string;
    timeoutRecovered: string;
    callbackOriginal: string;
    callbackReplay: string;
  }>;
  attemptIds: Readonly<{
    success: string;
    decline: string;
    controlledTimeoutRecovery: string;
    callbackReplay: string;
  }>;
}>;

export type IyzicoSandboxEvidenceOperatorResult = Readonly<{
  kind: "attested";
  runId: string;
  attestationId: string;
  matrixDigest: string;
  replayed: boolean;
}>;

export interface IyzicoSandboxEvidenceOperator {
  run(input: IyzicoSandboxEvidenceOperatorInput): Promise<IyzicoSandboxEvidenceOperatorResult>;
}
