import type {
  BarcodeInternalCreateIntent,
  BarcodeInternalCreateResult,
  BarcodeLabelListQuery,
  BarcodeLabelListResult,
  BarcodeLabelTemplate,
  BarcodeLabelTemplateSaveIntent,
  BarcodePrintJob,
  BarcodePrintJobSummary,
  BarcodePrintJobCreateIntent,
  TenantContext,
} from "@celebix/saas-contracts";
import type {
  PostgresPoolLike,
  PostgresTimeoutOptions,
} from "../postgres/pool.ts";

export type BarcodeLabelAuthority = Readonly<{
  tenantContext: TenantContext;
  now: Date;
}>;
export type ListBarcodeLabelsInput = BarcodeLabelAuthority &
  Readonly<{ query: BarcodeLabelListQuery; cursor?: string }>;
export type SaveBarcodeLabelTemplateInput = BarcodeLabelAuthority &
  BarcodeLabelTemplateSaveIntent &
  Readonly<{ operationId: string }>;
export type ArchiveBarcodeLabelTemplateInput = BarcodeLabelAuthority &
  Readonly<{
    operationId: string;
    templateId: string;
    expectedVersion: number;
  }>;
export type GenerateInternalBarcodesInput = BarcodeLabelAuthority &
  BarcodeInternalCreateIntent &
  Readonly<{ operationId: string }>;
export type CreateBarcodePrintJobInput = BarcodeLabelAuthority &
  BarcodePrintJobCreateIntent &
  Readonly<{
    operationId: string;
    templateName: string;
  }>;

export interface BarcodeLabelRepository {
  list(input: ListBarcodeLabelsInput): Promise<BarcodeLabelListResult>;
  listTemplates(
    input: BarcodeLabelAuthority,
  ): Promise<readonly BarcodeLabelTemplate[]>;
  saveTemplate(
    input: SaveBarcodeLabelTemplateInput,
  ): Promise<BarcodeLabelTemplate>;
  archiveTemplate(
    input: ArchiveBarcodeLabelTemplateInput,
  ): Promise<BarcodeLabelTemplate>;
  generateInternal(
    input: GenerateInternalBarcodesInput,
  ): Promise<BarcodeInternalCreateResult>;
  listJobs(input: BarcodeLabelAuthority): Promise<readonly BarcodePrintJobSummary[]>;
  createJob(input: CreateBarcodePrintJobInput): Promise<BarcodePrintJob>;
  getJob(
    input: BarcodeLabelAuthority & Readonly<{ jobId: string }>,
  ): Promise<BarcodePrintJob>;
}

export interface PostgresBarcodeLabelRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (
    event: Readonly<{ type: "barcode_label_commit_unknown" }>,
  ) => void | Promise<void>;
}
