import type { MerchantAdminJson, TenantContext } from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";

export type IyzicoSandboxEvidenceRunStatus = "pending" | "leased" | "attested" | "rejected";

export type BeginIyzicoSandboxEvidenceInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
  runId: string;
  fingerprint: string;
  profileId: string;
  expectedProfileVersion: number;
  expectedCredentialVersion: number;
  candidateEvidenceDigest: string;
  adapterVersion: number;
}>;

export type BeginIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "created" | "operation_replayed";
  runId: string;
  status: IyzicoSandboxEvidenceRunStatus;
  replayed: boolean;
}>;

export type BeginCurrentIyzicoSandboxEvidenceInput = BeginIyzicoSandboxEvidenceInput;

export type BeginCurrentIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "created" | "operation_replayed";
  runId: string;
  status: IyzicoSandboxEvidenceRunStatus;
  methodId: string;
  methodVersion: number;
  methodState: "disabled";
  replayed: boolean;
}>;

export type CurrentIyzicoSandboxEvidenceInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
  profileId: string;
}>;

export type IyzicoSandboxEvidenceRejectionCode =
  | "callback_mismatch"
  | "timeout_mismatch"
  | "stale_evidence";

export type IyzicoSandboxEvidenceMethodState =
  | "active"
  | "disabled"
  | "emergency_disabled";

export type CurrentIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "not_started" | "current";
  profileId: string;
  runId: string | null;
  status: IyzicoSandboxEvidenceRunStatus | null;
  rejectionCode: IyzicoSandboxEvidenceRejectionCode | null;
  methodId: string | null;
  methodVersion: number | null;
  methodState: IyzicoSandboxEvidenceMethodState | null;
  profileVersion: number;
  credentialVersion: number;
  attestationId: string | null;
  activationCurrent: boolean;
}>;

export type ClaimIyzicoSandboxEvidenceInput = Readonly<{
  runId: string;
  workerId: string;
  leaseId: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

export type ClaimIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "claimed" | "operation_replayed";
  runId: string;
  leaseId: string;
  replayed: boolean;
}>;

export type ClaimNextIyzicoSandboxEvidenceInput = Readonly<{
  workerId: string;
  leaseId: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

export type ClaimNextIyzicoSandboxEvidenceResult =
  | Readonly<{ outcome: "none" }>
  | Readonly<{
      outcome: "claimed" | "operation_replayed";
      runId: string;
      storeId: string;
      profileId: string;
      adapterVersion: number;
      candidateEvidenceDigest: string;
      profileVersion: number;
      credentialVersion: number;
      leaseId: string;
      replayed: boolean;
    }>;

export type ClaimedIyzicoSandboxEvidenceProfileInput = Readonly<{
  runId: string;
  leaseId: string;
  workerId: string;
  now: Date;
}>;

export type ClaimedIyzicoSandboxEvidenceProfileResult = Readonly<{
  outcome: "current";
  storeId: string;
  profileId: string;
  providerCode: "iyzico_iframe";
  capability: "payment_processing";
  publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  sealedCredentials: SealedMerchantProviderCredential;
  profileVersion: number;
  credentialVersion: number;
}>;

type IyzicoSandboxEvidenceEventCommon = Readonly<{
  runId: string;
  leaseId: string;
  workerId: string;
  eventId: string;
  attemptId: string;
  observationDigest: string;
  observedAt: Date;
}>;

export type RecordIyzicoSandboxEvidenceEventInput = IyzicoSandboxEvidenceEventCommon & (
  | Readonly<{ caseKind: "success"; eventKind: "success_captured"; outcomeCode: "captured" }>
  | Readonly<{ caseKind: "decline"; eventKind: "declined"; outcomeCode: "declined" }>
  | Readonly<{
      caseKind: "controlled_timeout_recovery";
      eventKind: "timeout_unknown";
      outcomeCode: "unknown";
    }>
  | Readonly<{
      caseKind: "controlled_timeout_recovery";
      eventKind: "timeout_recovered";
      outcomeCode: "recovered";
    }>
  | Readonly<{
      caseKind: "callback_replay";
      eventKind: "callback_original";
      outcomeCode: "accepted";
    }>
  | Readonly<{
      caseKind: "callback_replay";
      eventKind: "callback_replay";
      outcomeCode: "replayed";
    }>
);

export type RecordIyzicoSandboxEvidenceEventResult = Readonly<{
  outcome: "recorded" | "operation_replayed";
  eventId: string;
  replayed: boolean;
}>;

export type FinalizeIyzicoSandboxEvidenceInput = Readonly<{
  runId: string;
  leaseId: string;
  workerId: string;
  attestationId: string;
  fingerprint: string;
  now: Date;
}>;

export type FinalizeIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "attested" | "operation_replayed";
  attestationId: string;
  matrixDigest: string;
  replayed: boolean;
}>;

export type ActivateIyzicoSandboxEvidenceInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  fingerprint: string;
  methodId: string;
  expectedMethodVersion: number;
  attestationId: string;
  expectedProfileVersion: number;
}>;

export type ActivateIyzicoSandboxEvidenceResult = Readonly<{
  outcome: "state_changed" | "operation_replayed";
  id: string;
  state: "active";
  position: number;
  version: number;
  updatedAt: string;
  replayed: boolean;
  activationAttestationId: string;
}>;

export type ActivateCurrentIyzicoSandboxEvidenceInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  fingerprint: string;
  methodId: string;
  expectedMethodVersion: number;
}>;

export type ActivateCurrentIyzicoSandboxEvidenceResult = ActivateIyzicoSandboxEvidenceResult;

export interface IyzicoSandboxEvidenceAppRepository {
  begin(input: BeginIyzicoSandboxEvidenceInput): Promise<BeginIyzicoSandboxEvidenceResult>;
  activate(input: ActivateIyzicoSandboxEvidenceInput): Promise<ActivateIyzicoSandboxEvidenceResult>;
  preflight(): Promise<true>;
}

export interface IyzicoSandboxEvidenceActivationAppRepository
extends IyzicoSandboxEvidenceAppRepository {
  beginCurrent(
    input: BeginCurrentIyzicoSandboxEvidenceInput,
  ): Promise<BeginCurrentIyzicoSandboxEvidenceResult>;
  current(input: CurrentIyzicoSandboxEvidenceInput): Promise<CurrentIyzicoSandboxEvidenceResult>;
  activateCurrent(
    input: ActivateCurrentIyzicoSandboxEvidenceInput,
  ): Promise<ActivateCurrentIyzicoSandboxEvidenceResult>;
  activationRuntimePreflight(): Promise<true>;
}

export interface IyzicoSandboxEvidenceWorkflowRepository {
  claim(input: ClaimIyzicoSandboxEvidenceInput): Promise<ClaimIyzicoSandboxEvidenceResult>;
  recordEvent(
    input: RecordIyzicoSandboxEvidenceEventInput,
  ): Promise<RecordIyzicoSandboxEvidenceEventResult>;
  finalize(
    input: FinalizeIyzicoSandboxEvidenceInput,
  ): Promise<FinalizeIyzicoSandboxEvidenceResult>;
  preflight(): Promise<true>;
}

export interface IyzicoSandboxEvidenceActivationWorkflowRepository
extends IyzicoSandboxEvidenceWorkflowRepository {
  claimNext(input: ClaimNextIyzicoSandboxEvidenceInput): Promise<ClaimNextIyzicoSandboxEvidenceResult>;
  claimedProfile(
    input: ClaimedIyzicoSandboxEvidenceProfileInput,
  ): Promise<ClaimedIyzicoSandboxEvidenceProfileResult>;
}

export type IyzicoSandboxEvidenceAuditEvent = Readonly<{
  type: "iyzico_sandbox_evidence_commit_unknown";
  role: "app" | "workflow";
  operation:
    | "begin"
    | "begin_current"
    | "claim"
    | "claim_next"
    | "record_event"
    | "finalize"
    | "activate"
    | "activate_current";
}>;

type PostgresIyzicoSandboxEvidenceRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  timeouts: PostgresTimeoutOptions;
  audit: (event: IyzicoSandboxEvidenceAuditEvent) => void | Promise<void>;
}>;

export type PostgresIyzicoSandboxEvidenceAppRepositoryOptions =
  PostgresIyzicoSandboxEvidenceRepositoryOptions & Readonly<{ role: "celebix_saas_app" }>;

export type PostgresIyzicoSandboxEvidenceWorkflowRepositoryOptions =
  PostgresIyzicoSandboxEvidenceRepositoryOptions & Readonly<{ role: "celebix_saas_workflow" }>;
