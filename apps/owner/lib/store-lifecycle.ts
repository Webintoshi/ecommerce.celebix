import "server-only";

import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { readGeneratedRuntimeIssueCode } from "@/lib/generated-runtime-readiness";

export type ProvisioningState =
  | "running"
  | "provisioning"
  | "pending_dns"
  | "pending_auth"
  | "pending_analytics"
  | "pending_payment"
  | "ready"
  | "pending_repair"
  | "failed";
export type ProvisioningStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";
export type CleanupRunStatus = "resolved" | "orphaned";
export type DomainMigrationState = "idle" | "running" | "completed" | "failed" | "rolled_back";
export type DomainMigrationRollbackState = "not_needed" | "running" | "completed" | "failed";

export type ProvisioningStepKey =
  | "owner_supabase_auth"
  | "cleanup_guard"
  | "deployment_branch_preflight"
  | "supabase_preflight"
  | "r2_preflight"
  | "coolify_preflight"
  | "github_preflight"
  | "starter_source_preflight"
  | "generated_apps_toggle"
  | "authority_repo_sync"
  | "management_profile"
  | "supabase_provision"
  | "starter_seed"
  | "r2_provision"
  | "admin_blueprint"
  | "admin_deploy"
  | "storefront_scaffold"
  | "storefront_blueprint"
  | "storefront_repo_sync"
  | "storefront_deploy"
  | "analytics_setup"
  | "auth_setup"
  | "payment_setup";

export interface ProvisioningStepSummary {
  key: ProvisioningStepKey;
  label: string;
  status: ProvisioningStepStatus;
  blocking: boolean;
  message: string | null;
  updatedAt: string | null;
}

export interface ProvisioningSummary {
  state: ProvisioningState;
  lastError: string | null;
  lastRunAt: string | null;
  steps: ProvisioningStepSummary[];
}

export interface CleanupTargetSummary {
  type: string;
  identifier: string;
  status: "deleted" | "missing" | "failed" | "skipped";
  message?: string | null;
}

export interface CleanupRunSummary {
  id: string;
  slug: string;
  storeName: string;
  status: CleanupRunStatus;
  authorityDeletedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  targets: CleanupTargetSummary[];
}

export interface DomainMigrationSummary {
  state: DomainMigrationState;
  previousStorefrontDomain: string | null;
  previousAdminDomain: string | null;
  storefrontDomain: string | null;
  adminDomain: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  authoritySyncMessage: string | null;
  adminDeploymentStatus: string | null;
  storefrontDeploymentStatus: string | null;
  rollbackState: DomainMigrationRollbackState;
  rollbackCompletedAt: string | null;
  rollbackError: string | null;
}

const STEP_LABELS: Record<ProvisioningStepKey, string> = {
  owner_supabase_auth: "Owner Supabase authority",
  cleanup_guard: "Cleanup tombstone guard",
  supabase_preflight: "Database bootstrap preflight",
  deployment_branch_preflight: "Deployment branch guard",
  r2_preflight: "R2 bootstrap preflight",
  coolify_preflight: "Coolify preflight",
  github_preflight: "GitHub sync preflight",
  starter_source_preflight: "Starter source preflight",
  generated_apps_toggle: "Generated apps toggle",
  authority_repo_sync: "Authority repo sync",
  management_profile: "Owner management profile",
  supabase_provision: "Database provisioning",
  starter_seed: "Starter content seed",
  r2_provision: "R2 provisioning",
  storefront_scaffold: "Storefront scaffold",
  storefront_repo_sync: "Storefront repo sync",
  storefront_blueprint: "Storefront blueprint",
  storefront_deploy: "Storefront deployment",
  admin_blueprint: "Admin blueprint",
  admin_deploy: "Admin deployment",
  analytics_setup: "Analytics setup",
  auth_setup: "Auth setup",
  payment_setup: "Payment setup",
};

export const PROVISIONING_STEP_KEYS = Object.keys(STEP_LABELS) as ProvisioningStepKey[];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProvisioningState(value: unknown): ProvisioningState {
  return value === "running" ||
    value === "provisioning" ||
    value === "pending_dns" ||
    value === "pending_auth" ||
    value === "pending_analytics" ||
    value === "pending_payment" ||
    value === "ready" ||
    value === "pending_repair" ||
    value === "failed"
    ? value
    : "provisioning";
}

function normalizeProvisioningStepStatus(value: unknown): ProvisioningStepStatus {
  return value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "skipped" ||
    value === "blocked"
    ? value
    : "pending";
}

function normalizeCleanupRunStatus(value: unknown): CleanupRunStatus {
  return value === "resolved" || value === "orphaned" ? value : "orphaned";
}

function normalizeDomainMigrationState(value: unknown): DomainMigrationState {
  return value === "idle" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "rolled_back"
    ? value
    : "idle";
}

function normalizeDomainMigrationRollbackState(value: unknown): DomainMigrationRollbackState {
  return value === "not_needed" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
    ? value
    : "not_needed";
}

function isMissingCleanupRunsTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /owner_cleanup_runs/i.test(error.message) && /does not exist|relation|schema cache/i.test(error.message);
}

function isBlankPostgrestError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  return !record.message && !record.details && !record.hint && !record.code;
}

function normalizeStep(value: unknown): ProvisioningStepSummary | null {
  const record = asRecord(value);
  const key = readOptionalString(record.key) as ProvisioningStepKey | null;

  if (!key || !(key in STEP_LABELS)) {
    return null;
  }

  return {
    key,
    label: STEP_LABELS[key],
    status: normalizeProvisioningStepStatus(record.status),
    blocking: readBoolean(record.blocking, true),
    message: readOptionalString(record.message),
    updatedAt: readOptionalString(record.updatedAt),
  };
}

function normalizeCleanupTarget(value: unknown): CleanupTargetSummary | null {
  const record = asRecord(value);
  const type = readOptionalString(record.type);
  const identifier = readOptionalString(record.identifier);
  const status = readOptionalString(record.status);

  if (!type || !identifier || !status) {
    return null;
  }

  if (status !== "deleted" && status !== "missing" && status !== "failed" && status !== "skipped") {
    return null;
  }

  return {
    type,
    identifier,
    status,
    message: readOptionalString(record.message),
  };
}

export function createDefaultProvisioningSteps(): ProvisioningStepSummary[] {
  return PROVISIONING_STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: "pending",
    blocking: true,
    message: null,
    updatedAt: null,
  }));
}

export function readProvisioningSummary(metadata: Record<string, unknown> | null | undefined): ProvisioningSummary {
  const root = asRecord(metadata);
  const provisioning = asRecord(root.provisioning);
  const stepsRecord = Array.isArray(provisioning.steps) ? provisioning.steps : [];
  const stepsByKey = new Map<ProvisioningStepKey, ProvisioningStepSummary>();

  for (const entry of stepsRecord) {
    const normalized = normalizeStep(entry);

    if (normalized) {
      stepsByKey.set(normalized.key, normalized);
    }
  }

  return {
    state: normalizeProvisioningState(provisioning.state),
    lastError: readOptionalString(provisioning.lastError),
    lastRunAt: readOptionalString(provisioning.lastRunAt),
    steps: PROVISIONING_STEP_KEYS.map((key) => stepsByKey.get(key) ?? {
      key,
      label: STEP_LABELS[key],
      status: "pending",
      blocking: true,
      message: null,
      updatedAt: null,
    }),
  };
}

function createDefaultDomainMigrationSummary(): DomainMigrationSummary {
  return {
    state: "idle",
    previousStorefrontDomain: null,
    previousAdminDomain: null,
    storefrontDomain: null,
    adminDomain: null,
    startedAt: null,
    completedAt: null,
    lastError: null,
    authoritySyncMessage: null,
    adminDeploymentStatus: null,
    storefrontDeploymentStatus: null,
    rollbackState: "not_needed",
    rollbackCompletedAt: null,
    rollbackError: null,
  };
}

export function readDomainMigrationSummary(
  metadata: Record<string, unknown> | null | undefined,
): DomainMigrationSummary {
  const root = asRecord(metadata);
  const migration = asRecord(root.domainMigration);
  const fallback = createDefaultDomainMigrationSummary();

  return {
    state: normalizeDomainMigrationState(migration.state),
    previousStorefrontDomain:
      readOptionalString(migration.previousStorefrontDomain) ?? fallback.previousStorefrontDomain,
    previousAdminDomain:
      readOptionalString(migration.previousAdminDomain) ?? fallback.previousAdminDomain,
    storefrontDomain: readOptionalString(migration.storefrontDomain) ?? fallback.storefrontDomain,
    adminDomain: readOptionalString(migration.adminDomain) ?? fallback.adminDomain,
    startedAt: readOptionalString(migration.startedAt) ?? fallback.startedAt,
    completedAt: readOptionalString(migration.completedAt) ?? fallback.completedAt,
    lastError: readOptionalString(migration.lastError) ?? fallback.lastError,
    authoritySyncMessage:
      readOptionalString(migration.authoritySyncMessage) ?? fallback.authoritySyncMessage,
    adminDeploymentStatus:
      readOptionalString(migration.adminDeploymentStatus) ?? fallback.adminDeploymentStatus,
    storefrontDeploymentStatus:
      readOptionalString(migration.storefrontDeploymentStatus) ?? fallback.storefrontDeploymentStatus,
    rollbackState: normalizeDomainMigrationRollbackState(migration.rollbackState),
    rollbackCompletedAt:
      readOptionalString(migration.rollbackCompletedAt) ?? fallback.rollbackCompletedAt,
    rollbackError: readOptionalString(migration.rollbackError) ?? fallback.rollbackError,
  };
}

function mergeDomainMigrationSummary(
  current: DomainMigrationSummary,
  input: Partial<DomainMigrationSummary>,
): DomainMigrationSummary {
  return {
    state: input.state ?? current.state,
    previousStorefrontDomain:
      input.previousStorefrontDomain !== undefined
        ? input.previousStorefrontDomain
        : current.previousStorefrontDomain,
    previousAdminDomain:
      input.previousAdminDomain !== undefined
        ? input.previousAdminDomain
        : current.previousAdminDomain,
    storefrontDomain:
      input.storefrontDomain !== undefined ? input.storefrontDomain : current.storefrontDomain,
    adminDomain:
      input.adminDomain !== undefined ? input.adminDomain : current.adminDomain,
    startedAt:
      input.startedAt !== undefined ? input.startedAt : current.startedAt,
    completedAt:
      input.completedAt !== undefined ? input.completedAt : current.completedAt,
    lastError:
      input.lastError !== undefined ? input.lastError : current.lastError,
    authoritySyncMessage:
      input.authoritySyncMessage !== undefined
        ? input.authoritySyncMessage
        : current.authoritySyncMessage,
    adminDeploymentStatus:
      input.adminDeploymentStatus !== undefined
        ? input.adminDeploymentStatus
        : current.adminDeploymentStatus,
    storefrontDeploymentStatus:
      input.storefrontDeploymentStatus !== undefined
        ? input.storefrontDeploymentStatus
        : current.storefrontDeploymentStatus,
    rollbackState:
      input.rollbackState !== undefined ? input.rollbackState : current.rollbackState,
    rollbackCompletedAt:
      input.rollbackCompletedAt !== undefined
        ? input.rollbackCompletedAt
        : current.rollbackCompletedAt,
    rollbackError:
      input.rollbackError !== undefined ? input.rollbackError : current.rollbackError,
  };
}

export function mergeProvisioningSummary(
  current: ProvisioningSummary,
  input: Partial<ProvisioningSummary>,
): ProvisioningSummary {
  return {
    state: input.state ?? current.state,
    lastError: input.lastError !== undefined ? input.lastError : current.lastError,
    lastRunAt: input.lastRunAt !== undefined ? input.lastRunAt : current.lastRunAt,
    steps: input.steps ?? current.steps,
  };
}

export function replaceProvisioningStep(
  steps: ProvisioningStepSummary[],
  key: ProvisioningStepKey,
  patch: Partial<ProvisioningStepSummary>,
): ProvisioningStepSummary[] {
  return steps.map((step) =>
    step.key === key
      ? {
          ...step,
          ...patch,
          key: step.key,
          label: step.label,
        }
      : step,
  );
}

async function readOwnerStoreMetadata(slug: string): Promise<Record<string, unknown>> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("metadata")
    .eq("slug", slug)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`"${slug}" icin owner authority bulunamadi.`);
  }

  return asRecord(data.metadata);
}

export async function persistDomainMigrationSummary(
  slug: string,
  input: Partial<DomainMigrationSummary>,
): Promise<DomainMigrationSummary> {
  const serviceClient = createOwnerServiceClient();
  const metadata = await readOwnerStoreMetadata(slug);
  const nextDomainMigration = mergeDomainMigrationSummary(
    readDomainMigrationSummary(metadata),
    input,
  );
  const nextMetadata = {
    ...metadata,
    domainMigration: nextDomainMigration,
  };
  const { error } = await serviceClient
    .from("owner_stores")
    .update({ metadata: nextMetadata })
    .eq("slug", slug);

  if (error) {
    throw new Error(error.message);
  }

  return nextDomainMigration;
}

export async function persistProvisioningSummary(
  slug: string,
  input: Partial<ProvisioningSummary>,
): Promise<ProvisioningSummary> {
  const serviceClient = createOwnerServiceClient();
  const metadata = await readOwnerStoreMetadata(slug);
  const nextProvisioning = mergeProvisioningSummary(readProvisioningSummary(metadata), input);
  const nextMetadata = {
    ...metadata,
    provisioning: nextProvisioning,
  };
  const { error } = await serviceClient
    .from("owner_stores")
    .update({ metadata: nextMetadata })
    .eq("slug", slug);

  if (error) {
    throw new Error(error.message);
  }

  return nextProvisioning;
}

export function getProvisioningBlockers(summary: ProvisioningSummary): ProvisioningStepSummary[] {
  return summary.steps.filter(
    (step) => (step.status === "failed" || step.status === "blocked") && step.blocking,
  );
}

export interface ProvisioningStateDerivationOptions {
  authPending?: boolean;
  analyticsPending?: boolean;
  paymentPending?: boolean;
  terminalFailure?: boolean;
}

export function deriveProvisioningState(
  steps: ProvisioningStepSummary[],
  lastError: string | null | undefined,
  options: ProvisioningStateDerivationOptions = {},
): ProvisioningState {
  const blockers = steps.filter(
    (step) => (step.status === "failed" || step.status === "blocked") && step.blocking,
  );

  if (blockers.length > 0) {
    return options.terminalFailure ? "failed" : "pending_repair";
  }

  if (steps.some((step) => step.status === "pending" || step.status === "running")) {
    return "provisioning";
  }

  const issueCodes = [lastError, ...steps.map((step) => step.message)]
    .map((message) => readGeneratedRuntimeIssueCode(message))
    .filter((code): code is NonNullable<typeof code> => Boolean(code));

  if (issueCodes.includes("pending_dns")) {
    return "pending_dns";
  }

  if (issueCodes.includes("proxy_not_ready") || issueCodes.includes("runtime_unreachable")) {
    return options.terminalFailure ? "failed" : "pending_repair";
  }

  if (options.authPending) {
    return "pending_auth";
  }

  if (options.analyticsPending) {
    return "pending_analytics";
  }

  if (options.paymentPending) {
    return "pending_payment";
  }

  return "ready";
}

export async function upsertProvisioningStep(
  slug: string,
  key: ProvisioningStepKey,
  patch: Partial<ProvisioningStepSummary> & {
    state?: ProvisioningState;
    lastError?: string | null;
    lastRunAt?: string | null;
  },
): Promise<ProvisioningSummary> {
  const metadata = await readOwnerStoreMetadata(slug);
  const current = readProvisioningSummary(metadata);
  const nextSteps = replaceProvisioningStep(current.steps, key, {
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  });

  return persistProvisioningSummary(slug, {
    state: patch.state ?? current.state,
    lastError: patch.lastError !== undefined ? patch.lastError : current.lastError,
    lastRunAt: patch.lastRunAt !== undefined ? patch.lastRunAt : current.lastRunAt,
    steps: nextSteps,
  });
}

export async function listCleanupRuns(input: {
  unresolvedOnly?: boolean;
  limit?: number;
  slug?: string;
} = {}): Promise<CleanupRunSummary[]> {
  const serviceClient = createOwnerServiceClient();
  let query = serviceClient
    .from("owner_cleanup_runs")
    .select("id, slug, store_name, status, authority_deleted_at, resolved_at, targets, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (input.unresolvedOnly) {
    query = query.eq("status", "orphaned");
  }

  if (input.slug) {
    query = query.eq("slug", input.slug);
  }

  if (input.limit) {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingCleanupRunsTableError(new Error(error.message))) {
      return [];
    }

    throw new Error(error.message);
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: readOptionalString(row.id) ?? "",
    slug: readOptionalString(row.slug) ?? "",
    storeName: readOptionalString(row.store_name) ?? "",
    status: normalizeCleanupRunStatus(row.status),
    authorityDeletedAt: readOptionalString(row.authority_deleted_at),
    resolvedAt: readOptionalString(row.resolved_at),
    createdAt: readOptionalString(row.created_at) ?? new Date().toISOString(),
    updatedAt: readOptionalString(row.updated_at) ?? new Date().toISOString(),
    targets: (Array.isArray(row.targets) ? row.targets : [])
      .map((entry) => normalizeCleanupTarget(entry))
      .filter((entry): entry is CleanupTargetSummary => Boolean(entry)),
  }));
}

export async function hasUnresolvedCleanupRun(slug: string): Promise<boolean> {
  const serviceClient = createOwnerServiceClient();
  const { count, error } = await serviceClient
    .from("owner_cleanup_runs")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug)
    .eq("status", "orphaned");

  if (error) {
    if (isMissingCleanupRunsTableError(new Error(error.message))) {
      return false;
    }

    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

export async function listUnresolvedCleanupSlugs(): Promise<Set<string>> {
  const runs = await listCleanupRuns({ unresolvedOnly: true, limit: 500 });
  return new Set(runs.map((run) => run.slug));
}

export async function createCleanupRun(input: {
  slug: string;
  storeName: string;
  targets: CleanupTargetSummary[];
  authorityDeletedAt: string | null;
}): Promise<CleanupRunSummary> {
  const orphaned = input.targets.some((target) => target.status === "failed" || target.status === "skipped");
  const serviceClient = createOwnerServiceClient();
  const payload = {
    slug: input.slug,
    store_name: input.storeName,
    status: orphaned ? "orphaned" : "resolved",
    authority_deleted_at: input.authorityDeletedAt,
    resolved_at: orphaned ? null : new Date().toISOString(),
    targets: input.targets,
  };
  const { data, error } = await serviceClient
    .from("owner_cleanup_runs")
    .insert(payload)
    .select("id, slug, store_name, status, authority_deleted_at, resolved_at, targets, created_at, updated_at")
    .single<Record<string, unknown>>();

  if (error) {
    const fallbackError = typeof error.message === "string" ? new Error(error.message) : error;

    if (isMissingCleanupRunsTableError(fallbackError) || isBlankPostgrestError(error)) {
      const now = new Date().toISOString();
      return {
        id: "",
        slug: input.slug,
        storeName: input.storeName,
        status: orphaned ? "orphaned" : "resolved",
        authorityDeletedAt: input.authorityDeletedAt,
        resolvedAt: orphaned ? null : now,
        createdAt: now,
        updatedAt: now,
        targets: input.targets,
      };
    }

    throw new Error(
      typeof error.message === "string" && error.message.trim().length > 0
        ? error.message
        : "Cleanup run authority yazilamadi.",
    );
  }

  return {
    id: readOptionalString(data.id) ?? "",
    slug: readOptionalString(data.slug) ?? input.slug,
    storeName: readOptionalString(data.store_name) ?? input.storeName,
    status: normalizeCleanupRunStatus(data.status),
    authorityDeletedAt: readOptionalString(data.authority_deleted_at),
    resolvedAt: readOptionalString(data.resolved_at),
    createdAt: readOptionalString(data.created_at) ?? new Date().toISOString(),
    updatedAt: readOptionalString(data.updated_at) ?? new Date().toISOString(),
    targets: (Array.isArray(data.targets) ? data.targets : [])
      .map((entry) => normalizeCleanupTarget(entry))
      .filter((entry): entry is CleanupTargetSummary => Boolean(entry)),
  };
}
