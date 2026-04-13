import "server-only";

import { createOwnerServiceClient } from "@/lib/owner-supabase-server";

export type ProvisioningState = "ready" | "running" | "pending_repair";
export type ProvisioningStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type CleanupRunStatus = "resolved" | "orphaned";

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
  | "storefront_deploy";

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

const STEP_LABELS: Record<ProvisioningStepKey, string> = {
  owner_supabase_auth: "Owner Supabase authority",
  cleanup_guard: "Cleanup tombstone guard",
  deployment_branch_preflight: "Deployment branch guard",
  supabase_preflight: "Supabase bootstrap preflight",
  r2_preflight: "R2 bootstrap preflight",
  coolify_preflight: "Coolify preflight",
  github_preflight: "GitHub sync preflight",
  starter_source_preflight: "Starter source preflight",
  generated_apps_toggle: "Generated apps toggle",
  authority_repo_sync: "Authority repo sync",
  management_profile: "Owner management profile",
  supabase_provision: "Supabase provisioning",
  starter_seed: "Starter content seed",
  r2_provision: "R2 provisioning",
  admin_blueprint: "Admin blueprint",
  admin_deploy: "Admin deployment",
  storefront_scaffold: "Storefront scaffold",
  storefront_blueprint: "Storefront blueprint",
  storefront_repo_sync: "Storefront repo sync",
  storefront_deploy: "Storefront deployment",
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
  return value === "ready" || value === "running" || value === "pending_repair"
    ? value
    : "ready";
}

function normalizeProvisioningStepStatus(value: unknown): ProvisioningStepStatus {
  return value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "skipped"
    ? value
    : "pending";
}

function normalizeCleanupRunStatus(value: unknown): CleanupRunStatus {
  return value === "resolved" || value === "orphaned" ? value : "orphaned";
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
  return summary.steps.filter((step) => step.status === "failed" && step.blocking);
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
