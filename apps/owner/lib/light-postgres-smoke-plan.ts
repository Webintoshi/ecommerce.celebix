import "server-only";

export interface LightPostgresSmokePlan {
  branch: string;
  ownerApp: string;
  disposableSlugFormat: string;
  databaseTarget: "non-production-light-postgres";
  createsResources: string[];
  doesNotCreateResources: string[];
  cleanupSteps: string[];
  acceptanceChecks: string[];
}

export function buildLightPostgresNonProductionSmokePlan(): LightPostgresSmokePlan {
  return {
    branch: "codex/owner-light-postgres-provisioning-hardening",
    ownerApp: "isolated owner preview/staging app",
    disposableSlugFormat: "atlas-lpg-smoke-YYYYMMDD-HHMM",
    databaseTarget: "non-production-light-postgres",
    createsResources: [
      "Disposable light_postgres database",
      "Disposable runtime role",
      "storefront_core schema objects",
      "Baseline settings/payment/auth/optional-module seed rows",
    ],
    doesNotCreateResources: [
      "Production owner deployment",
      "Production customer store",
      "Coolify production application",
      "Logto live application",
      "Umami live website",
      "R2 bucket or production prefix",
      "DNS record",
    ],
    cleanupSteps: [
      "Disable owner auto-provision generated apps unless explicitly testing generated app deploy.",
      "Drop disposable runtime role after smoke.",
      "Drop disposable database after smoke.",
      "Remove disposable store config/registry entry if a local or staging authority record was created.",
      "Verify no production owner/customer deployment was triggered.",
    ],
    acceptanceChecks: [
      "Preflight fails before create when admin DB URL is missing.",
      "Preflight fails before create when runtime DB URL template is missing.",
      "Preflight fails before create when store role password template is missing.",
      "Provisioning creates DB, role, schema, baseline seed and readiness metadata in non-production.",
      "Readiness reports missing tables, seed keys, payment gateways, auth bridge or optional modules without secret values.",
      "light_postgres flow does not require full_supabase projectRef/url.",
    ],
  };
}
