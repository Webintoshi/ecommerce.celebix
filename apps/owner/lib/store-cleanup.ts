import "server-only";

import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { recordOwnerAuditLog } from "@/lib/control-plane";

interface OwnerStoreCleanupRow {
  id: string;
  slug: string;
  name: string;
  admin_domain: string;
  storefront_domain: string;
  r2_bucket_name: string | null;
  metadata: Record<string, unknown> | null;
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

interface CleanupTargetResult {
  type: "admin" | "storefront" | "supabase" | "owner-record";
  identifier: string;
  status: "deleted" | "missing" | "failed";
  message?: string | null;
}

export interface StoreCleanupResult {
  slug: string;
  deleted: boolean;
  targets: CleanupTargetResult[];
}

interface StoreCleanupOptions {
  force?: boolean;
}

const COOLIFY_API_PREFIX = "/api/v1";

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

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCoolifyApiToken()}`,
    "Content-Type": "application/json",
  };
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
    ...init,
    headers: {
      ...buildHeaders(),
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
  input: { resourceId?: string | null; name?: string | null; runtimeUrl?: string | null },
): Promise<CleanupTargetResult> {
  const match = matchApplication(applications, input);
  const identifier = input.name || input.resourceId || input.runtimeUrl || "unknown-admin-app";

  if (!match?.uuid) {
    return { type: input.name?.includes("storefront") ? "storefront" : "admin", identifier, status: "missing" };
  }

  try {
    await coolifyFetch(`/applications/${match.uuid}`, { method: "DELETE" });
    return {
      type: input.name?.includes("storefront") ? "storefront" : "admin",
      identifier: match.uuid,
      status: "deleted",
    };
  } catch (error) {
    return {
      type: input.name?.includes("storefront") ? "storefront" : "admin",
      identifier: match.uuid,
      status: "failed",
      message: error instanceof Error ? error.message : "Application silinemedi.",
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
    return {
      type: "supabase",
      identifier: match.uuid,
      status: "deleted",
    };
  } catch (error) {
    return {
      type: "supabase",
      identifier: match.uuid,
      status: "failed",
      message: error instanceof Error ? error.message : "Supabase service silinemedi.",
    };
  }
}

function buildCleanupTargets(store: OwnerStoreCleanupRow) {
  const metadata = asRecord(store.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const storefront = asRecord(metadata.storefront);

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
    },
    supabase: {
      resourceId: readString(bootstrap.supabaseResourceId),
      name: readString(bootstrap.supabaseProjectName) ?? `${store.slug}-db`,
    },
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
    .select("id, slug, name, admin_domain, storefront_domain, r2_bucket_name, metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Temizlenecek proje bulunamadi.");
  }

  const store = data as OwnerStoreCleanupRow;

  if (!options.force && !store.slug.startsWith("smoke-")) {
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
    },
  });

  results.push(await deleteCoolifyApplication(applications, targets.admin));
  results.push(await deleteCoolifyApplication(applications, targets.storefront));
  results.push(await deleteCoolifyService(services, targets.supabase));

  try {
    const { error: deleteError } = await serviceClient.from("owner_stores").delete().eq("slug", slug);

    if (deleteError) {
      results.push({
        type: "owner-record",
        identifier: slug,
        status: "failed",
        message: deleteError.message,
      });
    } else {
      results.push({
        type: "owner-record",
        identifier: slug,
        status: "deleted",
      });
    }
  } catch (error) {
    results.push({
      type: "owner-record",
      identifier: slug,
      status: "failed",
      message: error instanceof Error ? error.message : "Owner kaydi silinemedi.",
    });
  }

  await recordOwnerAuditLog({
    actorId,
    action: "store_cleanup_completed",
    targetType: "store",
    targetId: store.slug,
    details: {
      results,
    },
  });

  return {
    slug: store.slug,
    deleted: results.every((result) => result.status === "deleted" || result.status === "missing"),
    targets: results,
  };
}
