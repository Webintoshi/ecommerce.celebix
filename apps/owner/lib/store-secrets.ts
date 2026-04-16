import "server-only";

import { readCoolifySupabaseRuntimeAuthority } from "@/lib/coolify-runtime-authority";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";

export interface OwnerStoreSecretRow {
  store_id: string;
  supabase_url: string | null;
  supabase_service_role_key: string | null;
  supabase_anon_key: string | null;
  supabase_legacy_url: string | null;
  supabase_legacy_anon_key: string | null;
}

const BASE_SECRET_SELECT = "store_id, supabase_url, supabase_service_role_key";
const FULL_SECRET_SELECT = `${BASE_SECRET_SELECT}, supabase_anon_key, supabase_legacy_url, supabase_legacy_anon_key`;
const METADATA_SECRET_KEY = "_ownerSecretAuthority";

interface OwnerStoreMetadataRow {
  slug?: string | null;
  metadata: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeComparableSecret(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function isExpandedSecretColumnError(message: string | undefined): boolean {
  return /(supabase_anon_key|supabase_legacy_url|supabase_legacy_anon_key)/i.test(message || "");
}

function withExpandedDefaults(
  row: Pick<OwnerStoreSecretRow, "store_id" | "supabase_url" | "supabase_service_role_key"> | null
): OwnerStoreSecretRow | null {
  if (!row) {
    return null;
  }

  return {
    ...row,
    supabase_anon_key: null,
    supabase_legacy_url: null,
    supabase_legacy_anon_key: null,
  };
}

function mergeMetadataFallback(
  row: OwnerStoreSecretRow | null,
  metadataRow: OwnerStoreMetadataRow | null
): OwnerStoreSecretRow | null {
  if (!row) {
    return null;
  }

  const metadata = asRecord(metadataRow?.metadata);
  const fallback = asRecord(metadata[METADATA_SECRET_KEY]);

  return {
    ...row,
    supabase_anon_key: row.supabase_anon_key ?? normalizeOptionalString(fallback.supabase_anon_key),
    supabase_legacy_url: row.supabase_legacy_url ?? normalizeOptionalString(fallback.supabase_legacy_url),
    supabase_legacy_anon_key:
      row.supabase_legacy_anon_key ?? normalizeOptionalString(fallback.supabase_legacy_anon_key),
  };
}

async function resolveStoreId(slug: string): Promise<string | null> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient.from("owner_stores").select("id").eq("slug", slug).maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function getStoreMetadataByStoreId(storeId: string): Promise<OwnerStoreMetadataRow | null> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("slug, metadata")
    .eq("id", storeId)
    .maybeSingle<OwnerStoreMetadataRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function readBootstrapSupabaseResourceId(metadataRow: OwnerStoreMetadataRow | null): string | null {
  const metadata = asRecord(metadataRow?.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  return normalizeOptionalString(bootstrap.supabaseResourceId);
}

async function upsertMetadataSecretFallbackByStoreId(input: {
  storeId: string;
  supabaseAnonKey?: string | null;
  supabaseLegacyUrl?: string | null;
  supabaseLegacyAnonKey?: string | null;
}): Promise<void> {
  const current = await getStoreMetadataByStoreId(input.storeId);
  const metadata = asRecord(current?.metadata);
  const existingFallback = asRecord(metadata[METADATA_SECRET_KEY]);

  const nextFallback = {
    ...existingFallback,
    ...(input.supabaseAnonKey !== undefined
      ? { supabase_anon_key: input.supabaseAnonKey?.trim() || null }
      : {}),
    ...(input.supabaseLegacyUrl !== undefined
      ? { supabase_legacy_url: input.supabaseLegacyUrl?.trim() || null }
      : {}),
    ...(input.supabaseLegacyAnonKey !== undefined
      ? { supabase_legacy_anon_key: input.supabaseLegacyAnonKey?.trim() || null }
      : {}),
  };
  const nextMetadata = {
    ...metadata,
    [METADATA_SECRET_KEY]: nextFallback,
  };
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient.from("owner_stores").update({ metadata: nextMetadata }).eq("id", input.storeId);

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertRuntimeSecretAuthorityByStoreId(input: {
  storeId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
}): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const basePayload = {
    store_id: input.storeId,
    supabase_url: input.supabaseUrl,
    supabase_service_role_key: input.supabaseServiceRoleKey,
  };
  const { error } = await serviceClient.from("owner_store_secrets").upsert(
    {
      ...basePayload,
      supabase_anon_key: input.supabaseAnonKey,
    },
    { onConflict: "store_id" }
  );

  if (error) {
    if (!isExpandedSecretColumnError(error.message)) {
      throw new Error(error.message);
    }

    const { error: fallbackError } = await serviceClient.from("owner_store_secrets").upsert(basePayload, {
      onConflict: "store_id"
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }
  }
}

async function recoverRuntimeSecretFallbackByStoreId(
  storeId: string,
  row: OwnerStoreSecretRow | null,
  metadataRow: OwnerStoreMetadataRow | null
): Promise<OwnerStoreSecretRow | null> {
  if (!row && !metadataRow) {
    return row;
  }

  const serviceUuid = readBootstrapSupabaseResourceId(metadataRow);
  const runtimeAuthority = await readCoolifySupabaseRuntimeAuthority(serviceUuid || "");

  if (!runtimeAuthority) {
    return row;
  }

  const hasAuthorityDrift =
    normalizeComparableSecret(row?.supabase_url) !== normalizeComparableSecret(runtimeAuthority.publicUrl) ||
    normalizeComparableSecret(row?.supabase_service_role_key) !== normalizeComparableSecret(runtimeAuthority.serviceKey) ||
    normalizeComparableSecret(row?.supabase_anon_key) !== normalizeComparableSecret(runtimeAuthority.publicKey);

  if (hasAuthorityDrift) {
    await upsertRuntimeSecretAuthorityByStoreId({
      storeId,
      supabaseUrl: runtimeAuthority.publicUrl,
      supabaseServiceRoleKey: runtimeAuthority.serviceKey,
      supabaseAnonKey: runtimeAuthority.publicKey,
    }).catch(() => undefined);
  }

  await upsertMetadataSecretFallbackByStoreId({
    storeId,
    supabaseAnonKey: runtimeAuthority.publicKey,
  }).catch(() => undefined);

  return {
    ...row,
    store_id: row?.store_id ?? storeId,
    supabase_anon_key: runtimeAuthority.publicKey,
    supabase_url: runtimeAuthority.publicUrl,
    supabase_service_role_key: runtimeAuthority.serviceKey,
    supabase_legacy_url: row?.supabase_legacy_url ?? null,
    supabase_legacy_anon_key: row?.supabase_legacy_anon_key ?? null,
  };
}

export async function getStoreSupabaseSecretByStoreId(storeId: string): Promise<OwnerStoreSecretRow | null> {
  const serviceClient = createOwnerServiceClient();
  const expandedQuery = serviceClient
    .from("owner_store_secrets")
    .select(FULL_SECRET_SELECT)
    .eq("store_id", storeId)
    .maybeSingle<OwnerStoreSecretRow>();

  const { data, error } = await expandedQuery;
  const metadataRow = await getStoreMetadataByStoreId(storeId).catch(() => null);

  if (error) {
    if (!isExpandedSecretColumnError(error.message)) {
      if (/owner_store_secrets/i.test(error.message)) {
        return recoverRuntimeSecretFallbackByStoreId(storeId, mergeMetadataFallback(null, metadataRow), metadataRow);
      }

      throw new Error(error.message);
    }

    const { data: fallbackData, error: fallbackError } = await serviceClient
      .from("owner_store_secrets")
      .select(BASE_SECRET_SELECT)
      .eq("store_id", storeId)
      .maybeSingle<Pick<OwnerStoreSecretRow, "store_id" | "supabase_url" | "supabase_service_role_key">>();

    if (fallbackError) {
      if (/owner_store_secrets/i.test(fallbackError.message)) {
        return recoverRuntimeSecretFallbackByStoreId(storeId, mergeMetadataFallback(null, metadataRow), metadataRow);
      }

      throw new Error(fallbackError.message);
    }

    return recoverRuntimeSecretFallbackByStoreId(
      storeId,
      mergeMetadataFallback(withExpandedDefaults(fallbackData ?? null), metadataRow),
      metadataRow
    );
  }

  return recoverRuntimeSecretFallbackByStoreId(storeId, mergeMetadataFallback(data ?? null, metadataRow), metadataRow);
}

export async function getStoreSupabaseSecret(slug: string): Promise<OwnerStoreSecretRow | null> {
  const storeId = await resolveStoreId(slug);

  if (!storeId) {
    return null;
  }

  return getStoreSupabaseSecretByStoreId(storeId);
}

export async function upsertStoreSupabaseSecret(input: {
  slug: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey?: string | null;
  supabaseLegacyUrl?: string | null;
  supabaseLegacyAnonKey?: string | null;
}): Promise<void> {
  const storeId = await resolveStoreId(input.slug);

  if (!storeId) {
    throw new Error(`Store bulunamadi: ${input.slug}`);
  }

  const basePayload = {
    store_id: storeId,
    supabase_url: input.supabaseUrl,
    supabase_service_role_key: input.supabaseServiceRoleKey
  };
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient.from("owner_store_secrets").upsert(
    {
      ...basePayload,
      supabase_anon_key: input.supabaseAnonKey ?? null,
      supabase_legacy_url: input.supabaseLegacyUrl ?? null,
      supabase_legacy_anon_key: input.supabaseLegacyAnonKey ?? null
    },
    { onConflict: "store_id" }
  );

  if (error) {
    if (!isExpandedSecretColumnError(error.message)) {
      throw new Error(error.message);
    }

    const { error: fallbackError } = await serviceClient.from("owner_store_secrets").upsert(basePayload, {
      onConflict: "store_id"
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    await upsertMetadataSecretFallbackByStoreId({
      storeId,
      supabaseAnonKey: input.supabaseAnonKey ?? null,
      supabaseLegacyUrl: input.supabaseLegacyUrl ?? null,
      supabaseLegacyAnonKey: input.supabaseLegacyAnonKey ?? null,
    });
  }
}
