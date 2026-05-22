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

const SELF_HOSTED_ONLY_MESSAGE =
  "Managed Supabase kapali. Owner panel yalnizca self-hosted Coolify Supabase provision eder.";

function readConfiguredSupabaseProvider(): string | null {
  const value = process.env.SUPABASE_PROVIDER?.trim().toLowerCase();
  return value || null;
}

export function getSupabaseBootstrapPolicyViolation(): string | null {
  const configuredProvider = readConfiguredSupabaseProvider();

  if (configuredProvider === "managed") {
    return `${SELF_HOSTED_ONLY_MESSAGE} SUPABASE_PROVIDER=managed kullanilamaz.`;
  }

  return null;
}

export function resolveSupabaseBootstrapProvider(): SupabaseProvider {
  return "self_hosted_coolify";
}

export function assertSelfHostedSupabaseBootstrapPolicy(): void {
  const violation = getSupabaseBootstrapPolicyViolation();

  if (violation) {
    throw new Error(violation);
  }
}
