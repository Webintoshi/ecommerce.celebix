import "server-only";

import type { StoreConfig, StoreStandardResourceStatus } from "@celebix/platform-config";

export type R2ProvisioningEnvironment = "production" | "preview" | "staging";

export interface R2StorageConfigInput {
  storeSlug: string;
  storeName: string;
  storefrontDomain: string;
  environment: R2ProvisioningEnvironment;
}

export interface GeneratedR2StorageConfig {
  storage: {
    provider: "r2";
    bucket: string | null;
    prefix: string;
    publicBaseUrl: string | null;
    endpoint: string | null;
    region: string;
    status: StoreStandardResourceStatus;
  };
  media: {
    uploadPrefix: string;
    productImagesPrefix: string;
    pageImagesPrefix: string;
    brandingPrefix: string;
    publicUrlTemplate: string | null;
  };
  adminUpload: {
    status: "pending" | "configured" | "failed";
    credentialAuthority: "server_only";
    maxSizeMb: number;
    allowedTypes: string[];
  };
  storefrontRead: {
    status: "pending" | "configured" | "failed";
    noSupabaseStorage: true;
    fallback: "local-placeholder";
  };
  bootstrap: {
    configPath: string;
    applyState: "pending";
  };
}

export interface R2AuthorityRequirement {
  key: string;
  aliases: string[];
  required: boolean;
  scope: "owner" | "cloudflare-r2" | "generated-runtime";
  usedBy: string;
  missingBehavior: string;
  secret: boolean;
  present: boolean;
}

const FORBIDDEN_PRODUCTION_URL_PATTERNS = [
  /localhost/i,
  /0\.0\.0\.0/,
  /127\.0\.0\.1/,
  /:3000(?:\/|$)/,
];

function readEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value && !value.toLowerCase().startsWith("your-r2-")) {
      return value;
    }
  }

  return null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function assertSafePublicUrl(url: string, environment: R2ProvisioningEnvironment): void {
  const parsed = new URL(url);

  if (environment === "production" && parsed.protocol !== "https:") {
    throw new Error(`Production R2 public URL https olmalidir: ${url}`);
  }

  if (environment === "production" && FORBIDDEN_PRODUCTION_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error(`Production R2 public URL local/dev origin iceremez: ${url}`);
  }
}

function resolveBucketName(): string | null {
  return readEnv(["R2_BUCKET_NAME", "CLOUDFLARE_R2_BUCKET_NAME"]);
}

function resolvePublicBaseUrl(): string | null {
  const publicBaseUrl = readEnv(["R2_PUBLIC_URL", "NEXT_PUBLIC_R2_PUBLIC_URL", "R2_PUBLIC_BASE_URL"]);
  return publicBaseUrl ? stripTrailingSlash(publicBaseUrl) : null;
}

function resolveEndpoint(accountId: string | null): string | null {
  const endpoint = readEnv(["R2_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT"]);

  if (endpoint) {
    return stripTrailingSlash(endpoint);
  }

  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null;
}

export function getR2AuthorityRequirements(): R2AuthorityRequirement[] {
  return [
    {
      key: "CLOUDFLARE_ACCOUNT_ID",
      aliases: ["R2_ACCOUNT_ID"],
      required: true,
      scope: "cloudflare-r2",
      usedBy: "R2 endpoint generation and future live apply",
      missingBehavior: "Config generation continues; endpoint remains pending.",
      secret: false,
      present: Boolean(readEnv(["CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID"])),
    },
    {
      key: "R2_ACCESS_KEY_ID",
      aliases: [],
      required: true,
      scope: "cloudflare-r2",
      usedBy: "Future server-side admin media upload",
      missingBehavior: "Admin upload stays pending/disabled; no browser secret is generated.",
      secret: true,
      present: Boolean(readEnv(["R2_ACCESS_KEY_ID"])),
    },
    {
      key: "R2_SECRET_ACCESS_KEY",
      aliases: [],
      required: true,
      scope: "cloudflare-r2",
      usedBy: "Future server-side admin media upload",
      missingBehavior: "Admin upload stays pending/disabled; no browser secret is generated.",
      secret: true,
      present: Boolean(readEnv(["R2_SECRET_ACCESS_KEY"])),
    },
    {
      key: "R2_BUCKET_NAME",
      aliases: ["CLOUDFLARE_R2_BUCKET_NAME"],
      required: true,
      scope: "cloudflare-r2",
      usedBy: "Bucket authority metadata and runtime env",
      missingBehavior: "Storage metadata is generated with pending bucket authority.",
      secret: false,
      present: Boolean(resolveBucketName()),
    },
    {
      key: "R2_PUBLIC_URL",
      aliases: ["NEXT_PUBLIC_R2_PUBLIC_URL", "R2_PUBLIC_BASE_URL"],
      required: true,
      scope: "generated-runtime",
      usedBy: "Storefront image reads and public media URL template",
      missingBehavior: "Storefront media read stays pending until public URL is configured.",
      secret: false,
      present: Boolean(resolvePublicBaseUrl()),
    },
    {
      key: "R2_ENDPOINT",
      aliases: ["CLOUDFLARE_R2_ENDPOINT"],
      required: false,
      scope: "cloudflare-r2",
      usedBy: "S3-compatible server-side upload adapter",
      missingBehavior: "Falls back to Cloudflare account endpoint if account id exists.",
      secret: false,
      present: Boolean(readEnv(["R2_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT"])),
    },
  ];
}

export function buildR2StorageConfig(input: R2StorageConfigInput): GeneratedR2StorageConfig {
  const storeSlug = normalizeSlug(input.storeSlug);
  const bucket = resolveBucketName();
  const publicBaseUrl = resolvePublicBaseUrl();
  const accountId = readEnv(["CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID"]);
  const endpoint = resolveEndpoint(accountId);
  const prefix = `stores/${storeSlug}/`;
  const publicUrlTemplate = publicBaseUrl ? `${publicBaseUrl}/{key}` : null;
  const requirements = getR2AuthorityRequirements();
  const hasCredentials = requirements
    .filter((requirement) => requirement.secret)
    .every((requirement) => requirement.present);
  const status: StoreStandardResourceStatus = bucket && publicBaseUrl ? "configured" : "pending";

  if (publicBaseUrl) {
    assertSafePublicUrl(publicBaseUrl, input.environment);
  }

  return {
    storage: {
      provider: "r2",
      bucket,
      prefix,
      publicBaseUrl,
      endpoint,
      region: readEnv(["R2_REGION", "CLOUDFLARE_R2_REGION"]) || "auto",
      status,
    },
    media: {
      uploadPrefix: `${prefix}uploads/`,
      productImagesPrefix: `${prefix}products/`,
      pageImagesPrefix: `${prefix}pages/`,
      brandingPrefix: `${prefix}branding/`,
      publicUrlTemplate,
    },
    adminUpload: {
      status: bucket && hasCredentials ? "configured" : "pending",
      credentialAuthority: "server_only",
      maxSizeMb: 10,
      allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    },
    storefrontRead: {
      status: publicBaseUrl ? "configured" : "pending",
      noSupabaseStorage: true,
      fallback: "local-placeholder",
    },
    bootstrap: {
      configPath: `infra/r2/bootstrap/generated/${storeSlug}.storage.json`,
      applyState: "pending",
    },
  };
}

export function buildR2StorageConfigForStore(
  store: StoreConfig,
  environment: R2ProvisioningEnvironment = "production",
): GeneratedR2StorageConfig {
  return buildR2StorageConfig({
    storeSlug: store.slug,
    storeName: store.name,
    storefrontDomain: normalizeDomain(store.domains.storefront),
    environment,
  });
}

export function toR2StorageJson(config: GeneratedR2StorageConfig): Record<string, unknown> {
  return {
    provider: config.storage.provider,
    bucket: config.storage.bucket,
    prefix: config.storage.prefix,
    publicBaseUrl: config.storage.publicBaseUrl,
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    media: config.media,
    adminUpload: {
      status: config.adminUpload.status,
      credentialAuthority: config.adminUpload.credentialAuthority,
      maxSizeMb: config.adminUpload.maxSizeMb,
      allowedTypes: config.adminUpload.allowedTypes,
    },
    storefrontRead: config.storefrontRead,
  };
}
