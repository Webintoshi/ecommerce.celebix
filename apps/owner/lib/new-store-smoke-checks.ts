import "server-only";

import type {
  StoreConfig,
  StoreSmokeCategory,
  StoreSmokeCheckResult,
} from "@celebix/platform-config";

export type SmokeCheckKind = "http" | "redirect" | "runtime" | "metadata" | "security";
export type SmokeTarget = "storefront" | "admin" | "owner";

export interface SmokeCheckDefinition {
  id: string;
  label: string;
  category: StoreSmokeCategory;
  kind: SmokeCheckKind;
  target: SmokeTarget;
  path?: string;
  expected: string;
  expectedStatus?: number | number[];
  runtimeAssertions?: Record<string, string | string[]>;
  repairAction?: string;
  authenticated?: boolean;
}

function buildAdminCallbackPath(store: StoreConfig): string {
  return `/callback?error=invalid_request&redirect_uri=${encodeURIComponent(`https://${store.domains.admin}/callback`)}`;
}

export function buildNewStoreSmokeChecks(store: StoreConfig): SmokeCheckDefinition[] {
  return [
    { id: "storefront_home_200", label: "Storefront home", category: "storefront", kind: "http", target: "storefront", path: "/", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_products_200", label: "Storefront products", category: "storefront", kind: "http", target: "storefront", path: "/urunler", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_checkout_200", label: "Storefront checkout", category: "checkout", kind: "http", target: "storefront", path: "/odeme", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_blog_200", label: "Storefront blog", category: "storefront", kind: "http", target: "storefront", path: "/blog", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_runtime_200", label: "Storefront runtime endpoint", category: "storefront", kind: "http", target: "storefront", path: "/api/public/runtime", expectedStatus: 200, expected: "HTTP 200" },
    {
      id: "storefront_runtime_standard",
      label: "Storefront runtime standard",
      category: "storefront",
      kind: "runtime",
      target: "storefront",
      path: "/api/public/runtime",
      expected: "databaseMode=light_postgres, customerAuthStatus=logto_stable, storageProvider=r2, analyticsProvider=umami, supabaseStatus=none",
      runtimeAssertions: {
        databaseMode: "light_postgres",
        customerAuthStatus: "logto_stable",
        storageProvider: "r2",
        analyticsProvider: "umami",
        supabaseStatus: "none",
      },
      repairAction: "Generated storefront env/runtime metadata kontrol edilmeli.",
    },
    { id: "storefront_payments_200", label: "Public payment gateways", category: "checkout", kind: "http", target: "storefront", path: "/api/public/payments", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_login_200", label: "Customer login page", category: "auth", kind: "http", target: "storefront", path: "/giris", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_register_200", label: "Customer register page", category: "auth", kind: "http", target: "storefront", path: "/kayit", expectedStatus: 200, expected: "HTTP 200" },
    { id: "storefront_forgot_password_200", label: "Customer forgot password page", category: "auth", kind: "http", target: "storefront", path: "/sifremi-unuttum", expectedStatus: 200, expected: "HTTP 200" },
    { id: "customer_email_sign_in_307", label: "Customer email sign-in redirects", category: "auth", kind: "redirect", target: "storefront", path: "/api/auth/sign-in?identifier=email&firstScreen=identifier:sign-in&next=%2Fhesap", expectedStatus: 307, expected: "HTTP 307 to Logto" },
    { id: "customer_google_sign_in_307", label: "Customer Google sign-in redirects", category: "auth", kind: "redirect", target: "storefront", path: "/api/auth/sign-in?directSignIn=social:google&next=%2Fhesap", expectedStatus: 307, expected: "HTTP 307 to Logto" },
    { id: "customer_reset_password_307", label: "Customer reset-password redirects", category: "auth", kind: "redirect", target: "storefront", path: "/api/auth/sign-in?firstScreen=reset_password&identifier=email&next=%2Fgiris", expectedStatus: 307, expected: "HTTP 307 to Logto" },
    { id: "customer_invalid_callback_safe", label: "Invalid customer callback stays on public domain", category: "security", kind: "http", target: "storefront", path: "/callback?code=fake&state=fake", expectedStatus: [200, 302, 307, 400, 401], expected: "No local/dev redirect" },
    { id: "storefront_account_401", label: "Anonymous account API unauthorized", category: "auth", kind: "http", target: "storefront", path: "/api/account", expectedStatus: 401, expected: "HTTP 401" },
    { id: "storefront_missing_product_404", label: "Missing product returns 404", category: "storefront", kind: "http", target: "storefront", path: "/urunler/__missing_smoke_product__", expectedStatus: 404, expected: "HTTP 404" },
    { id: "storefront_missing_blog_404", label: "Missing blog returns 404", category: "storefront", kind: "http", target: "storefront", path: "/blog/__missing_smoke_post__", expectedStatus: 404, expected: "HTTP 404" },
    { id: "admin_login_200", label: "Admin login page", category: "admin", kind: "http", target: "admin", path: "/admin/login", expectedStatus: 200, expected: "HTTP 200" },
    { id: "admin_runtime_200", label: "Admin runtime endpoint", category: "admin", kind: "http", target: "admin", path: "/api/public/runtime", expectedStatus: 200, expected: "HTTP 200" },
    {
      id: "admin_runtime_standard",
      label: "Admin runtime standard",
      category: "admin",
      kind: "runtime",
      target: "admin",
      path: "/api/public/runtime",
      expected: "databaseMode=light_postgres, authProvider=logto, authStrategy=logto_oidc_bridge_v1 veya pending_auth_setup",
      runtimeAssertions: {
        databaseMode: "light_postgres",
        authProvider: "logto",
        authStrategy: ["logto_oidc_bridge_v1", "pending_auth_setup"],
      },
      repairAction: "Generated admin env/runtime metadata kontrol edilmeli.",
    },
    { id: "admin_sign_in_307", label: "Admin sign-in redirects", category: "auth", kind: "redirect", target: "admin", path: "/api/auth/sign-in?next=%2Fadmin", expectedStatus: [307, 503], expected: "HTTP 307 to Logto or 503 safe pending" },
    { id: "admin_invalid_callback_safe", label: "Invalid admin callback stays on public domain", category: "security", kind: "http", target: "admin", path: buildAdminCallbackPath(store), expectedStatus: [200, 302, 307, 400, 401], expected: "No local/dev redirect" },
    { id: "admin_analytics_safe", label: "Admin analytics route safe", category: "analytics", kind: "http", target: "admin", path: "/admin/analizler", expectedStatus: [200, 302, 307, 401], expected: "200 or auth-gated" },
    { id: "admin_analytics_summary_safe", label: "Admin analytics summary safe", category: "analytics", kind: "http", target: "admin", path: "/api/admin/analytics/summary", expectedStatus: [200, 401, 403], expected: "200 authenticated or auth-gated" },
    { id: "optional_modules_safe_disabled", label: "Optional modules safe-disabled", category: "optional_modules", kind: "metadata", target: "owner", expected: "Optional modules disabled or safe-gated" },
    { id: "umami_metadata", label: "Umami metadata present", category: "analytics", kind: "metadata", target: "owner", expected: "analyticsProvider=umami and script metadata present" },
    { id: "r2_media_metadata", label: "R2 media metadata present", category: "media", kind: "metadata", target: "owner", expected: "storageProvider=r2 and prefix metadata present" },
    { id: "r2_upload_auth_gated", label: "R2 upload endpoint auth-gated", category: "media", kind: "http", target: "admin", path: "/api/upload", expectedStatus: [401, 403, 405], expected: "Unauthenticated upload is rejected" },
    { id: "supabase_absence", label: "Supabase absence is healthy", category: "supabase_absence", kind: "metadata", target: "owner", expected: "supabaseStatus=none, storage disabled" },
    { id: "no_dev_redirects", label: "No localhost/0.0.0.0/:3000 redirects", category: "security", kind: "security", target: "owner", expected: "No dev origin in generated URLs" },
    { id: "no_secret_leak", label: "No secret leak in public smoke metadata", category: "security", kind: "security", target: "owner", expected: "No R2/Logto/Umami secret in public runtime" },
  ];
}

export function buildPlanResult(
  definition: SmokeCheckDefinition,
  store: StoreConfig,
): StoreSmokeCheckResult {
  const baseUrl = definition.target === "admin"
    ? `https://${store.domains.admin}`
    : definition.target === "storefront"
      ? `https://${store.domains.storefront}`
      : undefined;

  return {
    id: definition.id,
    label: definition.label,
    category: definition.category,
    status: "pending",
    expected: definition.expected,
    url: baseUrl && definition.path ? new URL(definition.path, baseUrl).toString() : undefined,
    repairAction: definition.repairAction,
    message: "Plan mode: HTTP request calistirilmadi.",
  };
}
