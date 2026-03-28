import "server-only";

import { createOwnerServiceClient } from "@/lib/owner-supabase-server";

interface OwnerStoreSecretRow {
  store_id: string;
  supabase_url: string | null;
  supabase_service_role_key: string | null;
}

async function resolveStoreId(slug: string): Promise<string | null> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient.from("owner_stores").select("id").eq("slug", slug).maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function getStoreSupabaseSecret(slug: string): Promise<OwnerStoreSecretRow | null> {
  const storeId = await resolveStoreId(slug);

  if (!storeId) {
    return null;
  }

  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_store_secrets")
    .select("store_id, supabase_url, supabase_service_role_key")
    .eq("store_id", storeId)
    .maybeSingle<OwnerStoreSecretRow>();

  if (error) {
    if (/owner_store_secrets/i.test(error.message)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ?? null;
}

export async function upsertStoreSupabaseSecret(input: {
  slug: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): Promise<void> {
  const storeId = await resolveStoreId(input.slug);

  if (!storeId) {
    throw new Error(`Store bulunamadi: ${input.slug}`);
  }

  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient.from("owner_store_secrets").upsert(
    {
      store_id: storeId,
      supabase_url: input.supabaseUrl,
      supabase_service_role_key: input.supabaseServiceRoleKey
    },
    { onConflict: "store_id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}
