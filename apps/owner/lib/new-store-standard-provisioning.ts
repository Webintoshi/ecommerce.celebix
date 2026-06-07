import type { StoreConfig } from "@celebix/platform-config";

export type NewStoreProvisioningHookKey =
  | "provisionLightPostgres"
  | "provisionR2"
  | "provisionLogtoAdminApp"
  | "provisionLogtoCustomerApp"
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
  status: "planned";
  message: string;
}

export type NewStoreSmokeArea = "storefront" | "admin" | "auth" | "analytics" | "checkout";
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
    status: "planned",
    createsLiveResource: true,
    nextPackage: "Package 3",
  },
  {
    key: "provisionLogtoCustomerApp",
    label: "Logto customer app bootstrap",
    status: "planned",
    createsLiveResource: true,
    nextPackage: "Package 3",
  },
  {
    key: "provisionUmamiWebsite",
    label: "Umami website record bootstrap",
    status: "planned",
    createsLiveResource: true,
    nextPackage: "Package 4",
  },
  {
    key: "configureStorefrontTracking",
    label: "Storefront Umami tracking runtime config",
    status: "planned",
    createsLiveResource: false,
    nextPackage: "Package 4",
  },
  {
    key: "configureAdminAnalytics",
    label: "Admin analytics endpoint/widget runtime config",
    status: "planned",
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
  { area: "storefront", key: "home", label: "Storefront home", target: "/", expectation: "http_200" },
  { area: "storefront", key: "products", label: "Storefront products", target: "/urunler", expectation: "http_200" },
  { area: "storefront", key: "checkout", label: "Storefront checkout", target: "/odeme", expectation: "http_200" },
  { area: "storefront", key: "runtime", label: "Public runtime config", target: "/api/public/runtime", expectation: "http_200" },
  { area: "storefront", key: "payments", label: "Public payment gateways", target: "/api/public/payments", expectation: "http_200" },
  { area: "storefront", key: "login", label: "Customer login page", target: "/giris", expectation: "http_200" },
  { area: "storefront", key: "register", label: "Customer register page", target: "/kayit", expectation: "http_200" },
  { area: "storefront", key: "forgot_password", label: "Customer forgot password page", target: "/sifremi-unuttum", expectation: "http_200" },
  { area: "admin", key: "admin_login", label: "Admin login page", target: "/admin/login", expectation: "http_200" },
  { area: "admin", key: "admin_runtime", label: "Admin runtime uses Logto/light_postgres", target: "runtime", expectation: "runtime_ready" },
  { area: "admin", key: "admin_me", label: "Authenticated admin identity", target: "/api/admin/me", expectation: "http_200" },
  { area: "admin", key: "admin_crud", label: "Products/categories/settings CRUD opens", target: "admin_core_tables", expectation: "runtime_ready" },
  { area: "auth", key: "admin_sign_in", label: "Admin sign-in redirect", target: "admin_sign_in", expectation: "http_307" },
  { area: "auth", key: "customer_sign_in", label: "Customer sign-in redirect", target: "customer_sign_in", expectation: "http_307" },
  { area: "auth", key: "google_sign_in", label: "Google sign-in redirect", target: "google_sign_in", expectation: "http_307" },
  { area: "auth", key: "forgot_password_redirect", label: "Forgot password redirect", target: "forgot_password", expectation: "http_307" },
  { area: "auth", key: "logout", label: "Admin and customer logout", target: "logout", expectation: "runtime_ready" },
  { area: "auth", key: "no_localhost", label: "No localhost/0.0.0.0/:3000 callback URI", target: "logto_redirect_uris", expectation: "runtime_ready" },
  { area: "analytics", key: "script_loaded", label: "Umami script loaded", target: "umami_script", expectation: "runtime_ready" },
  { area: "analytics", key: "website_id", label: "Umami websiteId exists", target: "umami_website_id", expectation: "runtime_ready" },
  { area: "analytics", key: "api_send", label: "Umami api/send accepted", target: "umami_api_send", expectation: "runtime_ready" },
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
  return plannedHookResult("provisionLogtoAdminApp", store);
}

export async function provisionLogtoCustomerApp(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("provisionLogtoCustomerApp", store);
}

export async function provisionUmamiWebsite(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("provisionUmamiWebsite", store);
}

export async function configureStorefrontTracking(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("configureStorefrontTracking", store);
}

export async function configureAdminAnalytics(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("configureAdminAnalytics", store);
}

export async function runNewStoreSmoke(store: StoreConfig): Promise<NewStoreProvisioningHookResult> {
  return plannedHookResult("runNewStoreSmoke", store);
}
