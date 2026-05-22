import type { StoreConfig } from "@celebix/platform-config";
import {
  getSupabaseBootstrapStatus as getCoolifySupabaseBootstrapStatus,
  provisionSupabaseForStore as provisionCoolifySupabaseForStore,
} from "@/lib/supabase-bootstrap-coolify";
import {
  assertSelfHostedSupabaseBootstrapPolicy,
  getSupabaseBootstrapPolicyViolation,
  resolveSupabaseBootstrapProvider,
  type SupabaseBootstrapStatus,
  type SupabaseProvisioningResult,
} from "@/lib/supabase-bootstrap.shared";

export type { SupabaseBootstrapStatus, SupabaseOrganization, SupabaseProvisioningResult } from "@/lib/supabase-bootstrap.shared";

export function getActiveSupabaseBootstrapProvider() {
  return resolveSupabaseBootstrapProvider();
}

export async function getSupabaseBootstrapStatus(): Promise<SupabaseBootstrapStatus> {
  const status = await getCoolifySupabaseBootstrapStatus();
  const policyViolation = getSupabaseBootstrapPolicyViolation();

  if (policyViolation) {
    return {
      ...status,
      configured: false,
      lastError: policyViolation,
    };
  }

  return status;
}

export async function provisionSupabaseForStore(store: StoreConfig): Promise<SupabaseProvisioningResult> {
  if (store.databaseMode !== "full_supabase") {
    throw new Error(
      "Bu magaza full_supabase explicit mode olmadan legacy Supabase provisioning akisina giremez.",
    );
  }

  assertSelfHostedSupabaseBootstrapPolicy();
  return provisionCoolifySupabaseForStore(store);
}
