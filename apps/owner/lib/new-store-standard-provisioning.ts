import type { StoreConfig } from "@celebix/platform-config";
import { provisionLogtoAppsForStore } from "@/lib/logto-provisioning";
import { provisionUmamiForStore } from "@/lib/umami-provisioning";

export type NewStoreProvisioningHookKey =
  | "provisionLightPostgres"
  | "provisionR2"
  | "provisionLogtoAdminApp"
  | "provisionLogtoCustomerApp"
  | "configureStorefrontAuth"
  | "configureAdminAuth"
  | "verifyLogtoReadiness"
  | "provisionUmamiWebsite"
  | "configureStorefrontTracking"
  | "configureAdminAnalytics"
  | "runNewStoreSmoke";

export type NewStoreProvisioningHookStatus = "implemented" | "planned";

export interface NewStoreProvisioningHookDefinition {
  key: NewStoreProvisioningHookKey;
  label: string;
  status: NewStoreProvisioningHookStatus;
  createsLiveResource: boolean;
  nextPackage: string;
}

export interface NewStoreProvisioningHookResult {
  key: NewStoreProvisioningHookKey;
  status: "planned" | "configured";
  message: string;
}

export type NewStoreSmokeArea = "database" | "storefront" | "admin" | "auth" | "analytics" | "checkout";
export type NewStoreSmokeExpectation = "http_200" | "http_307" | "runtime_ready" | "safe_state";

export interface NewStoreSmokeChecklistItem {
  area: NewStoreSmokeArea;
  key: string;
  label: string;
  target: string;
  expectation: NewStoreSmokeExpectation;
}

export const NEW_STORE_STANDARD_PROVISIONING_HOOKS: NewStoreProvisioningHookDefinition[] = [
  {
    key: "provisionLightPostgres",
    label: "light_postgres database/schema/seed provisioning",
    status: "implemented",
    createsLiveResource: true,
    nextPackage: "Package 2",
  },
  {
    key: "provisionR2",
    label: "R2 bucket/prefix/media authority provisioning",
    status: "implemented",
    createsLiveResource: true,
    nextPackage: "Package 5",
  },
  {
    key: "provisionLogtoAdminApp",
    label: "Logto admin app bootstrap",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 3",
  },
  {
    key: "provisionLogtoCustomerApp",
    label: "Logto customer app bootstrap",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 3",
  },
  {
    key: "configureStorefrontAuth",
    label: "Storefront Logto runtime config",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 3",
  },
  {
    key: "configureAdminAuth",
    label: "Admin Logto runtime config",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 3",
  },
  {
    key: "verifyLogtoReadiness",
    label: "Logto redirect/logout readiness model",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 3",
  },
  {
    key: "provisionUmamiWebsite",
    label: "Umami website record bootstrap",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 4",
  },
  {
    key: "configureStorefrontTracking",
    label: "Storefront Umami tracking runtime config",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 4",
  },
  {
    key: "configureAdminAnalytics",
    label: "Admin analytics endpoint/widget runtime config",
    status: "implemented",
    createsLiveResource: false,
    nextPackage: "Package 4",
  },
  {
    key: "runNewStoreSmoke",
    label: "New-store acceptance smoke checklist",
    status: "planned",
    createsLiveResource: false,
    nextPackage: "Package 7",
  },
];

export const NEW_STORE_SMOKE_CHECKLIST: NewStoreSmokeChecklistItem[] = [
  { area: "database", key: "light_postgres_connect", label: "light_postgres runtime role connects", target: "light_postgres_runtime_role", expectation: "runtime_ready" },
  { area: "database", key: "schema_core_tables", label: "Core commerce schema tables exist", target: "categories,products,customers,orders,payment_attempts", expectation: "runtime_ready" },
  { area: "database", key: "settings_seed", label: "Settings baseline seed exists", target: "settings.store_info,runtime,schema_version", expectation: "runtime_ready" },
  { area: "database", key: "payment_gateways_seed", label: "Payment gateways safe-disabled seed exists", target: "payment_gateways.bank_transfer,cod", expectation: "safe_state" },
  { area: "database", key: "auth_bridge_tables", label: "Logto auth bridge tables exist", target: "auth_principals,auth_store_memberships,auth_store_customer_links", expectation: "runtime_ready" },
  { area: "database", key: "optional_modules_disabled", label: "Optional modules start disabled", target: "optional_module_state", expectation: "safe_state" },
  { area: "database", key: "no_supabase_runtime_dependency", label: "No Supabase runtime dependency for light_postgres", target: "database_mode", expectation: "runtime_ready" },
  { area: "storefront", key: "home", label: "Storefront home", target: "/", expectation: "http_200" },
  { area: "storefront", key: "products", label: "Storefront products", target: "/urunler", expectation: "http_200" },
  { area: "storefront", key: "checkout", label: "Storefront checkout", target: "/odeme", expectation: "http_200" },
  { area: "storefront", key: "runtime", label: "Public runtime config", target: "/api/public/runtime", expectation: "http_200" },
  { area: "storefront", key: "payments", label: "Public payment gateways", target: "/api/public/payments", expectation: "http_200" },
  { area: "storefront", key: "login", label: "Customer login page", target: "/giris", expectation: "http_200" },
  { area: "storefront", key: "register", label: "Customer register page", target: "/kayit", expectation: "http_200" },
  { area: "storefront", key: "forgot_password", label: "Customer forgot password page", target: "/sifremi-unuttum", expectation: "http_200" },
  { area: "admin", key: "admin_login", label: "Admin login page", target: "/admin/login", expectation: "http_200" },
  { area: "admin", key: "admin_sign_in_route", label: "Admin Logto sign-in redirect", target: "/api/auth/sign-in?next=%2Fadmin", expectation: "http_307" },
  { area: "admin", key: "admin_callback_domain", label: "Admin callback uses public domain", target: "https://admin.<domain>/callback", expectation: "runtime_ready" },
  { area: "admin", key: "admin_logout_return", label: "Admin logout returns login", target: "/admin/login?logged_out=1", expectation: "runtime_ready" },
  { area: "admin", key: "admin_runtime", label: "Admin runtime uses Logto/light_postgres", target: "runtime", expectation: "runtime_ready" },
  { area: "admin", key: "admin_me", label: "Authenticated admin identity", target: "/api/admin/me", expectation: "http_200" },
  { area: "admin", key: "admin_crud", label: "Products/categories/settings CRUD opens", target: "admin_core_tables", expectation: "runtime_ready" },
  { area: "auth", key: "admin_sign_in", label: "Admin sign-in redirect", target: "admin_sign_in", expectation: "http_307" },
  { area: "auth", key: "customer_sign_in", label: "Customer sign-in redirect", target: "customer_sign_in", expectation: "http_307" },
  { area: "auth", key: "google_sign_in", label: "Google sign-in redirect", target: "google_sign_in", expectation: "http_307" },
  { area: "auth", key: "forgot_password_redirect", label: "Forgot password redirect", target: "forgot_password", expectation: "http_307" },
  { area: "auth", key: "customer_email_sign_in", label: "Customer email sign-in redirects to Logto", target: "email_sign_in", expectation: "http_307" },
  { area: "auth", key: "customer_logout", label: "Customer logout returns account login", target: "/giris?next=/hesap&logged_out=1", expectation: "runtime_ready" },
  { area: "auth", key: "anonymous_account", label: "Anonymous account API is unauthorized", target: "/api/account", expectation: "safe_state" },
  { area: "auth", key: "logout", label: "Admin and customer logout", target: "logout", expectation: "runtime_ready" },
  { area: "auth", key: "no_localhost", label: "No localhost/0.0.0.0/:3000 callback URI", target: "logto_redirect_uris", expectation: "runtime_ready" },
  { area: "analytics", key: "script_loaded", label: "Umami script loaded", target: "umami_script", expectation: "runtime_ready" },
  { area: "analytics", key: "website_id", label: "Umami websiteId exists", target: "umami_website_id", expectation: "runtime_ready" },
  { area: "analytics", key: "storefront_html_script", label: "Storefront HTML contains Umami script", target: "script[data-website-id]", expectation: "runtime_ready" },
  { area: "analytics", key: "api_send", label: "Umami api/send accepted", target: "umami_api_send", expectation: "runtime_ready" },
  { area: "analytics", key: "admin_analytics_page", label: "Admin analytics page renders", target: "/admin/analizler", expectation: "http_200" },
  { area: "analytics", key: "admin_analytics_summary", label: "Admin analytics summary endpoint", target: "/api/admin/analytics/summary", expectation: "http_200" },
  { area: "analytics", key: "token_server_only", label: "Umami token never reaches browser", target: "server_token_authority", expectation: "safe_state" },
  { area: "analytics", key: "store_scope", label: "Umami website scoped to canonical store domain", target: "canonical_domain", expectation: "runtime_ready" },
  { area: "analytics", key: "admin_analytics", label: "Admin analytics safe state or data", target: "admin_analytics", expectation: "safe_state" },
  { area: "checkout", key: "checkout_render", label: "Checkout page renders", target: "/odeme", expectation: "http_200" },
  { area: "checkout", key: "payment_gateway_visible", label: "Payment gateway visible", target: "payment_gateway", expectation: "runtime_ready" },
  { area: "checkout", key: "no_supabase_write", label: "No Supabase write path", target: "checkout_database_mode", expectation: "runtime_ready" },
];

function plannedHookResult(key: NewStoreProvisioningHookKey, store: StoreConfig): NewStoreProvisioningHookResult {
  return {
    key,
    status: "planned",
    message: `${key} hook is reserved for ${store.slug}; Package 1 does not create live resources.`,
  };
}

export async function provisionLightPostgres(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("provisionLightPostgres", store);
}

export async function provisionR2(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("provisionR2", store);
}

export async function provisionLogtoAdminApp(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionLogtoAppsForStore(store);
  return {
    key: "provisionLogtoAdminApp",
    status: "configured",
    message: `Admin Logto config generated for ${store.slug}: ${result.adminConfigPath}`,
  };
}

export async function provisionLogtoCustomerApp(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionLogtoAppsForStore(store);
  return {
    key: "provisionLogtoCustomerApp",
    status: "configured",
    message: `Customer Logto config generated for ${store.slug}: ${result.customerConfigPath}`,
  };
}

export async function configureStorefrontAuth(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionLogtoAppsForStore(store);
  return {
    key: "configureStorefrontAuth",
    status: "configured",
    message: `Storefront Logto redirect/logout metadata ready: ${result.config.customerApp.redirectUris.join(", ")}`,
  };
}

export async function configureAdminAuth(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionLogtoAppsForStore(store);
  return {
    key: "configureAdminAuth",
    status: "configured",
    message: `Admin Logto redirect/logout metadata ready: ${result.config.adminApp.redirectUris.join(", ")}`,
  };
}

export async function verifyLogtoReadiness(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionLogtoAppsForStore(store);
  return {
    key: "verifyLogtoReadiness",
    status: "configured",
    message: `Logto readiness pending apply; Google=${result.googleSignIn}, emailRecovery=${result.emailRecovery}.`,
  };
}

export async function provisionUmamiWebsite(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionUmamiForStore(store);
  return {
    key: "provisionUmamiWebsite",
    status: "configured",
    message: `Umami website config generated for ${store.slug}: ${result.configPath}`,
  };
}

export async function configureStorefrontTracking(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionUmamiForStore(store);
  return {
    key: "configureStorefrontTracking",
    status: "configured",
    message: `Storefront Umami tracking metadata ready: ${result.scriptUrl}`,
  };
}

export async function configureAdminAnalytics(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  const result = await provisionUmamiForStore(store);
  return {
    key: "configureAdminAnalytics",
    status: "configured",
    message: `Admin analytics summary metadata ready: ${result.adminSummaryEndpoint}`,
  };
}

export async function runNewStoreSmoke(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("runNewStoreSmoke", store);
}
