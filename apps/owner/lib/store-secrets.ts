import "server-only";

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

async function resolveStoreId(slug: string): Promise<string | null> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient.from("owner_stores").select("id").eq("slug", slug).maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function getStoreSupabaseSecretByStoreId(storeId: string): Promise<OwnerStoreSecretRow | null> {
  const serviceClient = createOwnerServiceClient();
  const expandedQuery = serviceClient
    .from("owner_store_secrets")
    .select(FULL_SECRET_SELECT)
    .eq("store_id", storeId)
    .maybeSingle<OwnerStoreSecretRow>();

  const { data, error } = await expandedQuery;

  if (error) {
    if (/owner_store_secrets/i.test(error.message)) {
      return null;
    }

    if (!isExpandedSecretColumnError(error.message)) {
      throw new Error(error.message);
    }

    const { data: fallbackData, error: fallbackError } = await serviceClient
      .from("owner_store_secrets")
      .select(BASE_SECRET_SELECT)
      .eq("store_id", storeId)
      .maybeSingle<Pick<OwnerStoreSecretRow, "store_id" | "supabase_url" | "supabase_service_role_key">>();

    if (fallbackError) {
      if (/owner_store_secrets/i.test(fallbackError.message)) {
        return null;
      }

      throw new Error(fallbackError.message);
    }

    return withExpandedDefaults(fallbackData ?? null);
  }

  return data ?? null;
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
  }
}
