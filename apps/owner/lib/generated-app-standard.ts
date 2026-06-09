import "server-only";

import {
  getDefaultAdminDeploymentBranch,
  type StoreConfig,
} from "@celebix/platform-config";

export type GeneratedAppTarget = "admin" | "storefront";

export interface GeneratedRuntimeStandard {
  storeSlug: string;
  storeName: string;
  target: GeneratedAppTarget;
  databaseMode: StoreConfig["databaseMode"];
  authProvider: StoreConfig["authProvider"];
  customerAuthProvider: StoreConfig["customerAuthProvider"];
  authStrategy: "logto_oidc_bridge_v1" | "pending_auth_setup" | "legacy_supabase_auth";
  storageProvider: StoreConfig["storageProvider"];
  analyticsProvider: StoreConfig["analyticsProvider"];
  supabaseStatus: StoreConfig["supabaseStatus"];
  r2: StoreConfig["r2"] | null;
  media: StoreConfig["media"] | null;
  umami: StoreConfig["umami"] | null;
  logto: StoreConfig["logto"] | null;
  optionalModules: Record<string, "disabled" | "pending" | "enabled">;
  readiness: StoreConfig["readiness"] | null;
  deployment: {
    strategy: string;
    image: string;
    imageTag: string;
    useBuildServer: boolean;
    buildServer: string;
    branch: string;
    workspace: string;
  };
}

const OPTIONAL_MODULE_SAFE_DISABLED: Record<string, "disabled"> = {
  quick_order_links: "disabled",
  coupons: "disabled",
  discounts: "disabled",
  lucky_wheel: "disabled",
  marketplace: "disabled",
  accounting: "disabled",
};

function readExisting(env: Record<string, string>, key: string): string | null {
  return env[key]?.trim() || null;
}

function buildLogtoStatus(store: StoreConfig, target: GeneratedAppTarget): "logto_stable" | "pending_auth_setup" {
  if (store.databaseMode !== "light_postgres") {
    return "pending_auth_setup";
  }

  const hasTargetClient =
    target === "admin"
      ? Boolean(store.logto?.adminClientId?.trim() || store.logto?.adminAppId?.trim())
      : Boolean(store.logto?.customerClientId?.trim() || store.logto?.customerAppId?.trim());

  return hasTargetClient ? "logto_stable" : "pending_auth_setup";
}

function buildAuthStrategy(
  store: StoreConfig,
  target: GeneratedAppTarget,
): GeneratedRuntimeStandard["authStrategy"] {
  if (store.databaseMode !== "light_postgres") {
    return "legacy_supabase_auth";
  }

  return buildLogtoStatus(store, target) === "logto_stable"
    ? "logto_oidc_bridge_v1"
    : "pending_auth_setup";
}

export function buildGeneratedRuntimeStandard(
  store: StoreConfig,
  target: GeneratedAppTarget,
): GeneratedRuntimeStandard {
  const deployment =
    target === "admin" ? store.bootstrap?.adminDeployment : store.storefront?.deployment;

  return {
    storeSlug: store.slug,
    storeName: store.name,
    target,
    databaseMode: store.databaseMode,
    authProvider: store.authProvider,
    customerAuthProvider: store.customerAuthProvider,
    authStrategy: buildAuthStrategy(store, target),
    storageProvider: store.storageProvider,
    analyticsProvider: store.analyticsProvider,
    supabaseStatus: store.supabaseStatus,
    r2: store.r2 ?? null,
    media: store.media ?? null,
    umami: store.umami ?? null,
    logto: store.logto ?? null,
    optionalModules: OPTIONAL_MODULE_SAFE_DISABLED,
    readiness: store.readiness ?? null,
    deployment: {
      strategy: deployment?.strategy ?? "build_server_ghcr",
      image:
        deployment?.image ??
        `ghcr.io/celebixco/${store.slug}-${target === "admin" ? "admin" : "storefront"}`,
      imageTag: deployment?.imageTag ?? "production",
      useBuildServer: deployment?.useBuildServer ?? true,
      buildServer: deployment?.buildServer ?? "celebix-build-01",
      branch:
        target === "admin"
          ? store.bootstrap?.adminDeploymentBranch ?? getDefaultAdminDeploymentBranch(store.slug)
          : store.storefront?.deploymentBranch ?? `deploy/storefront/${store.slug}`,
      workspace: target === "admin" ? "@celebix/admin" : store.storefront?.packageName ?? `@celebix/storefront-${store.slug}`,
    },
  };
}

export function buildGeneratedRuntimeEnv(
  store: StoreConfig,
  target: GeneratedAppTarget,
  existingEnv: Record<string, string> = {},
): Record<string, string> {
  const standard = buildGeneratedRuntimeStandard(store, target);
  const isAdmin = target === "admin";
  const logtoIssuer =
    (isAdmin ? store.logto?.adminIssuer : store.logto?.customerIssuer) ||
    store.logto?.adminIssuer ||
    store.logto?.customerIssuer ||
    "https://auth.celebix.co/oidc";
  const logtoClientId =
    (isAdmin ? store.logto?.adminClientId : store.logto?.customerClientId) ||
    (isAdmin ? store.logto?.adminAppId : store.logto?.customerAppId) ||
    "";
  const authStatus = buildLogtoStatus(store, target);
  const r2PublicUrl = store.r2?.publicUrl || store.media?.publicBaseUrl || "";
  const umamiScriptUrl = store.umami?.scriptUrl || "https://analytics.celebix.co/script.js";
  const umamiHost = store.umami?.host || "https://analytics.celebix.co";
  const umamiWebsiteId = store.umami?.websiteId || "";
  const env: Record<string, string> = {
    GENERATED_APP_STANDARD: "celebix_light_postgres_logto_umami_r2_v1",
    GENERATED_APP_TARGET: target,
    GENERATED_APP_RUNTIME_CONFIG: JSON.stringify(standard),
    DATABASE_MODE: store.databaseMode,
    NEXT_PUBLIC_RUNTIME_DATABASE_MODE: store.databaseMode,
    STORAGE_PROVIDER: store.storageProvider,
    NEXT_PUBLIC_STORAGE_PROVIDER: store.storageProvider,
    ANALYTICS_PROVIDER: store.analyticsProvider,
    NEXT_PUBLIC_ANALYTICS_PROVIDER: store.analyticsProvider,
    SUPABASE_STATUS: store.supabaseStatus,
    NEXT_PUBLIC_SUPABASE_STATUS: store.supabaseStatus,
    AUTH_SETUP_STATUS: authStatus,
    NEXT_PUBLIC_AUTH_SETUP_STATUS: authStatus,
    R2_PREFIX: store.r2?.prefix || store.media?.prefix || `stores/${store.slug}/`,
    R2_UPLOAD_PREFIX: store.r2?.uploadPrefix || store.media?.uploadPrefix || `stores/${store.slug}/uploads/`,
    R2_PRODUCT_IMAGES_PREFIX:
      store.r2?.productImagesPrefix || store.media?.productImagesPrefix || `stores/${store.slug}/products/`,
    R2_PAGE_IMAGES_PREFIX:
      store.r2?.pageImagesPrefix || store.media?.pageImagesPrefix || `stores/${store.slug}/pages/`,
    R2_BRANDING_PREFIX:
      store.r2?.brandingPrefix || store.media?.brandingPrefix || `stores/${store.slug}/branding/`,
    R2_PUBLIC_URL_TEMPLATE: store.r2?.publicUrlTemplate || store.media?.publicUrlTemplate || "",
    NEXT_PUBLIC_R2_PREFIX: store.r2?.prefix || store.media?.prefix || `stores/${store.slug}/`,
    NEXT_PUBLIC_R2_PUBLIC_URL: r2PublicUrl,
    UMAMI_BASE_URL: umamiHost,
    UMAMI_SCRIPT_URL: umamiScriptUrl,
    UMAMI_WEBSITE_ID: umamiWebsiteId,
    NEXT_PUBLIC_UMAMI_BASE_URL: umamiHost,
    NEXT_PUBLIC_UMAMI_SCRIPT_URL: umamiScriptUrl,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: umamiWebsiteId,
    OPTIONAL_MODULE_QUICK_ORDER_LINKS: "disabled",
    OPTIONAL_MODULE_COUPONS: "disabled",
    OPTIONAL_MODULE_DISCOUNTS: "disabled",
    OPTIONAL_MODULE_LUCKY_WHEEL: "disabled",
    OPTIONAL_MODULE_MARKETPLACE: "disabled",
    OPTIONAL_MODULE_ACCOUNTING: "disabled",
  };

  if (r2PublicUrl) {
    env.R2_PUBLIC_URL = r2PublicUrl;
  }

  if (isAdmin) {
    env.ADMIN_AUTH_PROVIDER = store.authProvider;
    env.NEXT_PUBLIC_ADMIN_AUTH_PROVIDER = store.authProvider;
    env.AUTH_STRATEGY = standard.authStrategy;
    env.NEXT_PUBLIC_AUTH_STRATEGY = standard.authStrategy;
    env.LOGTO_ISSUER = logtoIssuer;
    env.LOGTO_ADMIN_APP_ID = logtoClientId;
    env.LOGTO_CALLBACK_URL =
      store.logto?.adminRedirectUris?.[0] || `https://${store.domains.admin}/callback`;
    env.LOGTO_POST_LOGOUT_REDIRECT_URL =
      store.logto?.adminPostLogoutRedirectUris?.[0] || `https://${store.domains.admin}/admin/login`;

    for (const key of ["LOGTO_ADMIN_APP_SECRET", "LOGTO_APP_SECRET", "LOGTO_COOKIE_SECRET"]) {
      const value = readExisting(existingEnv, key);
      if (value) {
        env[key] = value;
      }
    }
  } else {
    env.CUSTOMER_AUTH_PROVIDER = store.customerAuthProvider;
    env.NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER = store.customerAuthProvider;
    env.CUSTOMER_AUTH_STATUS = authStatus;
    env.NEXT_PUBLIC_CUSTOMER_AUTH_STATUS = authStatus;
    env.LOGTO_CUSTOMER_ISSUER = logtoIssuer;
    env.LOGTO_CUSTOMER_APP_ID = logtoClientId;
    env.NEXT_PUBLIC_LOGTO_CUSTOMER_ISSUER = logtoIssuer;
    env.NEXT_PUBLIC_LOGTO_CUSTOMER_APP_ID = logtoClientId;
    env.LOGTO_CUSTOMER_CALLBACK_URL =
      store.logto?.customerRedirectUris?.[0] || `https://${store.domains.storefront}/callback`;
    env.LOGTO_CUSTOMER_POST_LOGOUT_REDIRECT_URL =
      store.logto?.customerPostLogoutRedirectUris?.[0] || `https://${store.domains.storefront}`;
  }

  return env;
}

export function buildGeneratedRuntimeJson(
  store: StoreConfig,
  target: GeneratedAppTarget,
): string {
  return `${JSON.stringify(buildGeneratedRuntimeStandard(store, target), null, 2)}\n`;
}
