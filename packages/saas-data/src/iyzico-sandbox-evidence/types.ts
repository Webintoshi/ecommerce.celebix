import type { TenantContext } from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

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

export interface IyzicoSandboxEvidenceAppRepository {
  begin(input: BeginIyzicoSandboxEvidenceInput): Promise<BeginIyzicoSandboxEvidenceResult>;
  activate(input: ActivateIyzicoSandboxEvidenceInput): Promise<ActivateIyzicoSandboxEvidenceResult>;
  preflight(): Promise<true>;
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

export type IyzicoSandboxEvidenceAuditEvent = Readonly<{
  type: "iyzico_sandbox_evidence_commit_unknown";
  role: "app" | "workflow";
  operation: "begin" | "claim" | "record_event" | "finalize" | "activate";
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
