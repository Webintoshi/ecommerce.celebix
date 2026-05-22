import type { StoreConfig } from "@celebix/platform-config";
import {
  getSupabaseBootstrapStatus as getCoolifySupabaseBootstrapStatus,
  provisionSupabaseForStore as provisionCoolifySupabaseForStore,
} from "@/lib/supabase-bootstrap-coolify";
import {
  getSupabaseBootstrapStatus as getManagedSupabaseBootstrapStatus,
  provisionSupabaseForStore as provisionManagedSupabaseForStore,
} from "@/lib/supabase-bootstrap-managed";
import {
  resolveSupabaseBootstrapProvider,
  type SupabaseBootstrapStatus,
  type SupabaseProvisioningResult,
} from "@/lib/supabase-bootstrap.shared";

export type { SupabaseBootstrapStatus, SupabaseOrganization, SupabaseProvisioningResult } from "@/lib/supabase-bootstrap.shared";

export function getActiveSupabaseBootstrapProvider() {
  return resolveSupabaseBootstrapProvider();
}

export async function getSupabaseBootstrapStatus(): Promise<SupabaseBootstrapStatus> {
  return resolveSupabaseBootstrapProvider() === "self_hosted_coolify"
    ? getCoolifySupabaseBootstrapStatus()
    : getManagedSupabaseBootstrapStatus();
}

export async function provisionSupabaseForStore(store: StoreConfig): Promise<SupabaseProvisioningResult> {
  if (store.databaseMode !== "full_supabase") {
    throw new Error(
      "Bu magaza full_supabase explicit mode olmadan legacy Supabase provisioning akisina giremez.",
    );
  }

  return resolveSupabaseBootstrapProvider() === "self_hosted_coolify"
    ? provisionCoolifySupabaseForStore(store)
    : provisionManagedSupabaseForStore(store);
}
