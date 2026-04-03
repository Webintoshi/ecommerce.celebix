import type { SupabaseProvider } from "@celebix/platform-config";

export interface SupabaseOrganization {
  id: string;
  slug: string;
  name: string;
}

export interface SupabaseBootstrapStatus {
  configured: boolean;
  provider: SupabaseProvider;
  hasAccessToken: boolean;
  hasOrgId: boolean;
  defaultRegion: string;
  defaultPlan: string;
  organizations: SupabaseOrganization[];
  resolvedOrganizationSlug: string | null;
  lastError?: string;
}

export interface SupabaseProvisioningResult {
  provider: SupabaseProvider;
  organization: SupabaseOrganization;
  projectRef: string;
  projectUrl: string;
  adminEnvLocalPath: string;
  dashboardUrl?: string;
  projectName?: string;
  resourceId?: string;
}

export function resolveSupabaseBootstrapProvider(): SupabaseProvider {
  const explicit = process.env.SUPABASE_PROVIDER?.trim().toLowerCase();

  if (explicit === "self_hosted_coolify") {
    return "self_hosted_coolify";
  }

  if (explicit === "managed") {
    return "managed";
  }

  return process.env.COOLIFY_API_URL?.trim() ? "self_hosted_coolify" : "managed";
}
