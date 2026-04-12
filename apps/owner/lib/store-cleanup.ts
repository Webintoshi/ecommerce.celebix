import "server-only";

import crypto from "node:crypto";
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getStoreConfig, removeStoreArtifacts } from "@celebix/platform-config";
import { recordOwnerAuditLog } from "@/lib/control-plane";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { deleteStorefrontRepoForStore, isGitHubRepoSyncConfigured } from "@/lib/storefront-repo-sync";

interface OwnerStoreCleanupRow {
  id: string;
  slug: string;
  name: string;
  admin_domain: string;
  storefront_domain: string;
  supabase_project_ref: string | null;
  r2_bucket_name: string | null;
  r2_managed_domain: string | null;
  metadata: Record<string, unknown> | null;
  storefront_app_dir: string | null;
}

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  fqdn?: string | null;
  domain?: string | null;
}

interface CoolifyService {
  uuid?: string;
  service_uuid?: string;
  resource_uuid?: string;
  name?: string;
}

interface CloudflareTokenVerifyResult {
  id: string;
  status: string;
}

interface CloudflareEnvelope<T> {
  result: T;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
}

type CleanupTargetType =
  | "admin"
  | "storefront"
  | "supabase"
  | "r2"
  | "repo-local"
  | "repo-github"
  | "owner-record"
  | "owner-audit";

interface CleanupTargetResult {
  type: CleanupTargetType;
  identifier: string;
  status: "deleted" | "missing" | "failed" | "skipped";
  message?: string | null;
}

export interface StoreCleanupResult {
  slug: string;
  deleted: boolean;
  targets: CleanupTargetResult[];
}

interface StoreCleanupOptions {
  force?: boolean;
  allowNonDisposable?: boolean;
}

interface StoreCleanupTargets {
  admin: {
    resourceId?: string | null;
    name?: string | null;
    runtimeUrl?: string | null;
  };
  storefront: {
    resourceId?: string | null;
    name?: string | null;
    runtimeUrl?: string | null;
    appDir?: string | null;
  };
  supabase: {
    provider: "managed" | "self_hosted_coolify" | "unknown";
    resourceId?: string | null;
    projectRef?: string | null;
    name?: string | null;
  };
  r2: {
    bucketName?: string | null;
    managedDomain?: string | null;
  };
}

const COOLIFY_API_PREFIX = "/api/v1";
const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com/v1";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getCoolifyApiUrl(): string {
  const raw = process.env.COOLIFY_API_URL?.trim();

  if (!raw) {
    throw new Error("COOLIFY_API_URL tanimli degil.");
  }

  return raw.replace(/\/+$/, "");
}

function getCoolifyApiToken(): string {
  const token = process.env.COOLIFY_API_TOKEN?.trim();

  if (!token) {
    throw new Error("COOLIFY_API_TOKEN tanimli degil.");
  }

  return token;
}

function getCloudflareApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN tanimli degil.");
  }

  return token;
}

function getCloudflareAccountId(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID tanimli degil.");
  }

  return accountId;
}

function getSupabaseAccessToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN tanimli degil.");
  }

  return token;
}

function buildCoolifyHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCoolifyApiToken()}`,
    "Content-Type": "application/json",
  };
}

function buildCloudflareHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCloudflareApiToken()}`,
    "Content-Type": "application/json",
  };
}

function buildSupabaseHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getSupabaseAccessToken()}`,
    "Content-Type": "application/json",
  };
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
    ...init,
    headers: {
      ...buildCoolifyHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Coolify API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function cloudflareFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API_URL}${pathname}`, {
    ...init,
    headers: {
      ...buildCloudflareHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as CloudflareEnvelope<T> | { errors?: Array<{ message: string }> };

  if (!response.ok || !("success" in payload) || payload.success !== true) {
    const errorMessage =
      "errors" in payload && Array.isArray(payload.errors) && payload.errors.length > 0
        ? payload.errors.map((error) => error.message).join(" | ")
        : response.statusText;
    throw new Error(`Cloudflare API hatasi (${response.status}): ${errorMessage}`);
  }

  return (payload as CloudflareEnvelope<T>).result;
}

async function supabaseManagementFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_URL}${pathname}`, {
    ...init,
    headers: {
      ...buildSupabaseHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    if ("data" in payload && Array.isArray((payload as { data?: unknown }).data)) {
      return (payload as { data: T[] }).data;
    }

    if ("applications" in payload && Array.isArray((payload as { applications?: unknown }).applications)) {
      return (payload as { applications: T[] }).applications;
    }

    if ("services" in payload && Array.isArray((payload as { services?: unknown }).services)) {
      return (payload as { services: T[] }).services;
    }
  }

  return [];
}

async function listApplications(): Promise<CoolifyApplication[]> {
  const payload = await coolifyFetch<unknown>("/applications");
  return normalizeArrayPayload<CoolifyApplication>(payload);
}

async function listServices(): Promise<CoolifyService[]> {
  const payload = await coolifyFetch<unknown>("/services");
  return normalizeArrayPayload<CoolifyService>(payload);
}

function matchApplication(
  applications: CoolifyApplication[],
  input: { resourceId?: string | null; name?: string | null; runtimeUrl?: string | null },
): CoolifyApplication | null {
  const normalizedRuntime = input.runtimeUrl?.replace(/\/+$/, "") || null;

  return (
    applications.find((application) => application.uuid === input.resourceId) ||
    applications.find((application) => application.name === input.name) ||
    applications.find((application) => {
      const fqdn = application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "") || null;
      return Boolean(normalizedRuntime && fqdn === normalizedRuntime);
    }) ||
    null
  );
}

function matchService(
  services: CoolifyService[],
  input: { resourceId?: string | null; name?: string | null },
): CoolifyService | null {
  return (
    services.find(
      (service) =>
        service.uuid === input.resourceId ||
        service.resource_uuid === input.resourceId ||
        service.service_uuid === input.resourceId,
    ) ||
    services.find((service) => service.name === input.name) ||
    null
  );
}

async function deleteCoolifyApplication(
  applications: CoolifyApplication[],
  type: "admin" | "storefront",
  input: { resourceId?: string | null; name?: string | null; runtimeUrl?: string | null },
): Promise<CleanupTargetResult> {
  const match = matchApplication(applications, input);
  const identifier = input.name || input.resourceId || input.runtimeUrl || `unknown-${type}-app`;

  if (!match?.uuid) {
    return { type, identifier, status: "missing" };
  }

  try {
    await coolifyFetch(`/applications/${match.uuid}`, { method: "DELETE" });
    return { type, identifier: match.uuid, status: "deleted" };
  } catch (error) {
    return {
      type,
      identifier: match.uuid,
      status: "failed",
      message: error instanceof Error ? error.message : `${type} uygulamasi silinemedi.`,
    };
  }
}

async function deleteCoolifyService(
  services: CoolifyService[],
  input: { resourceId?: string | null; name?: string | null },
): Promise<CleanupTargetResult> {
  const match = matchService(services, input);
  const identifier = input.name || input.resourceId || "unknown-supabase-service";

  if (!match?.uuid) {
    return { type: "supabase", identifier, status: "missing" };
  }

  try {
    await coolifyFetch(`/services/${match.uuid}`, { method: "DELETE" });
    return { type: "supabase", identifier: match.uuid, status: "deleted" };
  } catch (error) {
    return {
      type: "supabase",
      identifier: match.uuid,
      status: "failed",
      message: error instanceof Error ? error.message : "Self-hosted Supabase service silinemedi.",
    };
  }
}

async function deleteManagedSupabaseProject(projectRef: string | null): Promise<CleanupTargetResult> {
  const identifier = projectRef || "unknown-supabase-project";

  if (!projectRef || projectRef === "pending-owner-bootstrap") {
    return { type: "supabase", identifier, status: "missing" };
  }

  try {
    await supabaseManagementFetch(`/projects/${projectRef}`, { method: "DELETE" });
    return { type: "supabase", identifier: projectRef, status: "deleted" };
  } catch (error) {
    return {
      type: "supabase",
      identifier: projectRef,
      status: "failed",
      message: error instanceof Error ? error.message : "Managed Supabase projesi silinemedi.",
    };
  }
}

async function verifyCloudflareToken(): Promise<CloudflareTokenVerifyResult> {
  const accountId = getCloudflareAccountId();
  return cloudflareFetch<CloudflareTokenVerifyResult>(`/accounts/${accountId}/tokens/verify`);
}

function buildS3Credentials(tokenId: string) {
  const tokenValue = getCloudflareApiToken();

  return {
    accessKeyId: tokenId,
    secretAccessKey: crypto.createHash("sha256").update(tokenValue).digest("hex"),
  };
}

function createR2S3Client(tokenId: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${getCloudflareAccountId()}.r2.cloudflarestorage.com`,
    credentials: buildS3Credentials(tokenId),
  });
}

async function disableManagedDomain(bucketName: string): Promise<void> {
  const accountId = getCloudflareAccountId();

  await cloudflareFetch(`/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`, {
    method: "PUT",
    body: JSON.stringify({ enabled: false }),
  }).catch(() => undefined);
}

async function deleteAllBucketObjects(client: S3Client, bucketName: string): Promise<void> {
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (page.Contents ?? [])
      .map((entry) => entry.Key)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objects.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function deleteR2Bucket(bucketName: string | null, managedDomain: string | null): Promise<CleanupTargetResult> {
  const identifier = bucketName || managedDomain || "unknown-r2-bucket";

  if (!bucketName) {
    return { type: "r2", identifier, status: "missing" };
  }

  try {
    const token = await verifyCloudflareToken();
    const client = createR2S3Client(token.id);

    await disableManagedDomain(bucketName);
    await deleteAllBucketObjects(client, bucketName);
    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));

    return { type: "r2", identifier: bucketName, status: "deleted" };
  } catch (error) {
    return {
      type: "r2",
      identifier: bucketName,
      status: "failed",
      message: error instanceof Error ? error.message : "R2 bucket silinemedi.",
    };
  }
}

function buildCleanupTargets(store: OwnerStoreCleanupRow): StoreCleanupTargets {
  const metadata = asRecord(store.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const storefront = asRecord(metadata.storefront);
  const storeConfig = getStoreConfig(store.slug);
  const supabaseProvider =
    readString(storeConfig?.supabase.provider) ||
    readString(bootstrap.supabaseProvider) ||
    (store.supabase_project_ref?.startsWith("coolify:") ? "self_hosted_coolify" : null);
  const supabaseResourceId =
    readString(bootstrap.supabaseResourceId) ||
    (store.supabase_project_ref?.startsWith("coolify:")
      ? store.supabase_project_ref.split(":").at(-1) ?? null
      : null);

  return {
    admin: {
      resourceId: readString(bootstrap.adminDeploymentResourceId),
      name: readString(bootstrap.adminDeploymentName) ?? `${store.slug}-admin`,
      runtimeUrl: readString(bootstrap.adminDeploymentRuntimeUrl) ?? `https://${store.admin_domain}`,
    },
    storefront: {
      resourceId: readString(storefront.resourceId),
      name: readString(storefront.deploymentName) ?? `${store.slug}-storefront`,
      runtimeUrl: readString(storefront.runtimeUrl) ?? `https://${store.storefront_domain}`,
      appDir:
        store.storefront_app_dir ||
        readString(storefront.appDir) ||
        storeConfig?.storefront?.appDir ||
        `apps/storefront-${store.slug}`,
    },
    supabase: {
      provider:
        supabaseProvider === "managed" || supabaseProvider === "self_hosted_coolify"
          ? supabaseProvider
          : "unknown",
      resourceId: supabaseResourceId,
      projectRef: store.supabase_project_ref,
      name: readString(bootstrap.supabaseProjectName) ?? `${store.slug}-db`,
    },
    r2: {
      bucketName: store.r2_bucket_name,
      managedDomain: store.r2_managed_domain ?? storeConfig?.r2?.managedDomain ?? null,
    },
  };
}

function isBlockingFailure(result: CleanupTargetResult): boolean {
  if (result.status !== "failed") {
    return false;
  }

  return result.type !== "owner-audit";
}

async function deleteOwnerStoreRow(slug: string): Promise<CleanupTargetResult> {
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient.from("owner_stores").delete().eq("slug", slug);

  if (error) {
    return {
      type: "owner-record",
      identifier: slug,
      status: "failed",
      message: error.message,
    };
  }

  return {
    type: "owner-record",
    identifier: slug,
    status: "deleted",
  };
}

async function deleteStoreAuditLogs(slug: string): Promise<CleanupTargetResult> {
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient
    .from("owner_audit_logs")
    .delete()
    .eq("target_type", "store")
    .eq("target_id", slug);

  if (error) {
    return {
      type: "owner-audit",
      identifier: slug,
      status: "failed",
      message: error.message,
    };
  }

  return {
    type: "owner-audit",
    identifier: slug,
    status: "deleted",
  };
}

export async function cleanupStoreResources(
  actorId: string | null,
  slug: string,
  options: StoreCleanupOptions = {},
): Promise<StoreCleanupResult> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("id, slug, name, admin_domain, storefront_domain, supabase_project_ref, r2_bucket_name, r2_managed_domain, metadata, storefront_app_dir")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Temizlenecek proje bulunamadi.");
  }

  const store = data as OwnerStoreCleanupRow;

  if (!options.force && !options.allowNonDisposable && !store.slug.startsWith("smoke-")) {
    throw new Error("Bu cleanup yolu yalnizca disposable smoke projeler icin kullanilabilir.");
  }

  const targets = buildCleanupTargets(store);
  const [applications, services] = await Promise.all([listApplications(), listServices()]);
  const results: CleanupTargetResult[] = [];

  await recordOwnerAuditLog({
    actorId,
    action: "store_cleanup_started",
    targetType: "store",
    targetId: store.slug,
    details: {
      adminDomain: store.admin_domain,
      storefrontDomain: store.storefront_domain,
      adminResourceId: targets.admin.resourceId,
      storefrontResourceId: targets.storefront.resourceId,
      supabaseResourceId: targets.supabase.resourceId,
      supabaseProjectRef: targets.supabase.projectRef,
      r2BucketName: targets.r2.bucketName,
    },
  });

  results.push(await deleteCoolifyApplication(applications, "admin", targets.admin));
  results.push(await deleteCoolifyApplication(applications, "storefront", targets.storefront));

  if (targets.supabase.provider === "self_hosted_coolify") {
    results.push(
      await deleteCoolifyService(services, {
        resourceId: targets.supabase.resourceId,
        name: targets.supabase.name,
      }),
    );
  } else if (targets.supabase.provider === "managed") {
    results.push(await deleteManagedSupabaseProject(targets.supabase.projectRef ?? null));
  } else {
    results.push({
      type: "supabase",
      identifier: targets.supabase.projectRef || targets.supabase.name || "unknown-supabase",
      status: targets.supabase.projectRef || targets.supabase.resourceId ? "failed" : "missing",
      message:
        targets.supabase.projectRef || targets.supabase.resourceId
          ? "Supabase provider tespit edilemedi."
          : null,
    });
  }

  results.push(await deleteR2Bucket(targets.r2.bucketName ?? null, targets.r2.managedDomain ?? null));

  if (results.some(isBlockingFailure)) {
    await recordOwnerAuditLog({
      actorId,
      action: "store_cleanup_failed",
      targetType: "store",
      targetId: store.slug,
      details: { results },
    });

    return {
      slug: store.slug,
      deleted: false,
      targets: results,
    };
  }

  const localArtifacts = removeStoreArtifacts(store.slug, {
    storefrontAppDir: targets.storefront.appDir,
  });
  results.push({
    type: "repo-local",
    identifier: store.slug,
    status:
      localArtifacts.skippedPaths.length > 0
        ? "failed"
        : localArtifacts.removedPaths.length > 0 || localArtifacts.updatedPaths.length > 0
          ? "deleted"
          : "missing",
    message:
      localArtifacts.skippedPaths.length > 0
        ? `Guvensiz path temizligi atlandi: ${localArtifacts.skippedPaths.join(", ")}`
        : [
            ...localArtifacts.updatedPaths.map((entry) => `guncellendi:${entry}`),
            ...localArtifacts.removedPaths.map((entry) => `silindi:${entry}`),
          ].join(" | ") || null,
  });

  if (isGitHubRepoSyncConfigured()) {
    const remoteCleanup = await deleteStorefrontRepoForStore(store.slug, {
      storefrontAppDir: targets.storefront.appDir,
    });
    results.push({
      type: "repo-github",
      identifier: `${remoteCleanup.repository}:${remoteCleanup.branch}`,
      status:
        remoteCleanup.status === "deleted"
          ? "deleted"
          : remoteCleanup.status === "missing"
            ? "missing"
            : remoteCleanup.status === "skipped"
              ? "skipped"
              : "failed",
      message: remoteCleanup.message,
    });
  } else {
    results.push({
      type: "repo-github",
      identifier: store.slug,
      status: "skipped",
      message: "GitHub repo sync tanimli degil.",
    });
  }

  if (results.some(isBlockingFailure)) {
    await recordOwnerAuditLog({
      actorId,
      action: "store_cleanup_failed",
      targetType: "store",
      targetId: store.slug,
      details: { results },
    });

    return {
      slug: store.slug,
      deleted: false,
      targets: results,
    };
  }

  results.push(await deleteOwnerStoreRow(store.slug));

  if (results.some(isBlockingFailure)) {
    await recordOwnerAuditLog({
      actorId,
      action: "store_cleanup_failed",
      targetType: "store",
      targetId: store.slug,
      details: { results },
    });

    return {
      slug: store.slug,
      deleted: false,
      targets: results,
    };
  }

  results.push(await deleteStoreAuditLogs(store.slug));

  return {
    slug: store.slug,
    deleted: results.every(
      (result) =>
        result.status === "deleted" ||
        result.status === "missing" ||
        result.status === "skipped" ||
        (result.type === "owner-audit" && result.status === "failed"),
    ),
    targets: results,
  };
}
