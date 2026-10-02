import { parseStorefrontIdentityKeyring, type StorefrontIdentityKeyring } from "./account/credential.ts";
import { normalizeStorefrontAccountEmail } from "./account/email.ts";

export const STOREFRONT_DATA_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_DEPLOYMENT_TIER", "CELEBIX_STOREFRONT_DATA_MODE", "CELEBIX_SAAS_DATABASE_NAME",
  "CELEBIX_SAAS_DATABASE_URL", "CELEBIX_R2_MEDIA_ENVIRONMENT", "CELEBIX_R2_PUBLIC_ORIGIN",
] as const);

export const STOREFRONT_WHATSAPP_ENVIRONMENT_FIELDS=Object.freeze([
  "CELEBIX_STOREFRONT_ACCOUNT_WHATSAPP_MODE",
  "CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_API_KEY",
  "CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_REG_ID",
] as const);
export type StorefrontWhatsAppConfig=Readonly<{mode:"vatansms_device";apiKey:string;regId:string}>;
export function parseStorefrontWhatsAppConfig(source:Record<string,string|undefined>):StorefrontWhatsAppConfig|null {
  if(STOREFRONT_WHATSAPP_ENVIRONMENT_FIELDS.every(name=>source[name]===undefined||source[name]===""))return null;
  const apiKey=source.CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_API_KEY,regId=source.CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_REG_ID;
  if(source.CELEBIX_STOREFRONT_ACCOUNT_WHATSAPP_MODE!=="vatansms_device"||typeof apiKey!=="string"||!/^[A-Za-z0-9_-]{16,256}$/u.test(apiKey)||typeof regId!=="string"||!/^[0-9]{1,20}$/u.test(regId))throw new Error("storefront_whatsapp_config_invalid");
  return Object.freeze({mode:"vatansms_device",apiKey,regId});
}

export const STOREFRONT_IDENTITY_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_DEPLOYMENT_TIER",
  "CELEBIX_STOREFRONT_ACCOUNTS_MODE",
  "CELEBIX_STOREFRONT_ACCOUNT_ALLOWED_ORIGIN_SUFFIX",
  "CELEBIX_STOREFRONT_ACCOUNT_HMAC_ACTIVE_KEY_ID",
  "CELEBIX_STOREFRONT_ACCOUNT_HMAC_KEYS",
  "CELEBIX_STOREFRONT_ACCOUNT_SEAL_ACTIVE_KEY_ID",
  "CELEBIX_STOREFRONT_ACCOUNT_SEAL_KEYS",
  "CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE",
  "CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM",
  "CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY",
] as const);

type Environment = Record<string, string | undefined>;
export type StorefrontDataConfig = Readonly<{ database: Readonly<{ name: string; url: string }>; mediaOrigin: string }>;
export type StorefrontIdentityConfig = Readonly<{
  mode: "approved_staging";
  allowedOriginSuffix: ".saas-staging.celebix.site" | ".saas-staging.celebix.net";
  hmacKeyring: StorefrontIdentityKeyring;
  sealKeyring: StorefrontIdentityKeyring;
  email: Readonly<{ mode: "platform_resend"; from: string; apiKey: string }>;
}>;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
function invalid(): never { throw new Error("storefront_data_config_invalid"); }
function required(source: Environment, name: string, maximum = 4_096): string { const value = source[name]; if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || CONTROL.test(value)) invalid(); return value; }

export function isStorefrontCheckoutReadinessMigrationCompatible(
  value: Readonly<{ direct: unknown; wrapped: unknown }>,
): boolean {
  return value.direct === true || value.wrapped === true;
}

export function parseStorefrontDataConfig(source: Environment): StorefrontDataConfig {
  if (!source || typeof source !== "object" || Array.isArray(source) || source.CELEBIX_DEPLOYMENT_TIER !== "staging" || source.CELEBIX_STOREFRONT_DATA_MODE !== "approved_staging" || source.CELEBIX_R2_MEDIA_ENVIRONMENT !== "staging") invalid();
  const name = required(source, "CELEBIX_SAAS_DATABASE_NAME", 63);
  if (!DATABASE.test(name) || !name.includes("staging") || name.includes("production")) invalid();
  const rawDatabaseUrl = required(source, "CELEBIX_SAAS_DATABASE_URL");
  let databaseUrl: URL; try { databaseUrl = new URL(rawDatabaseUrl); } catch { return invalid(); }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.username || !databaseUrl.password || !databaseUrl.hostname || databaseUrl.pathname !== `/${name}` || databaseUrl.hash || databaseUrl.searchParams.size !== 1 || databaseUrl.searchParams.get("sslmode") !== "require") invalid();
  const rawMediaOrigin = required(source, "CELEBIX_R2_PUBLIC_ORIGIN", 2_048);
  let mediaOrigin: URL; try { mediaOrigin = new URL(rawMediaOrigin); } catch { return invalid(); }
  if (mediaOrigin.protocol !== "https:" || mediaOrigin.username || mediaOrigin.password || mediaOrigin.port || mediaOrigin.pathname !== "/" || mediaOrigin.search || mediaOrigin.hash || mediaOrigin.origin !== rawMediaOrigin || !mediaOrigin.hostname.endsWith(".saas-staging.celebix.site") || mediaOrigin.hostname.endsWith(".r2.dev") || mediaOrigin.hostname.endsWith(".r2.cloudflarestorage.com")) invalid();
  return Object.freeze({ database: Object.freeze({ name, url: rawDatabaseUrl }), mediaOrigin: rawMediaOrigin });
}

export function parseStorefrontIdentityConfig(source: Environment): StorefrontIdentityConfig {
  function identityInvalid(): never { throw new Error("storefront_identity_config_invalid"); }
  if (!source || typeof source !== "object" || Array.isArray(source) || source.CELEBIX_DEPLOYMENT_TIER !== "staging" || source.CELEBIX_STOREFRONT_ACCOUNTS_MODE !== "approved_staging" || ![".saas-staging.celebix.site", ".saas-staging.celebix.net"].includes(source.CELEBIX_STOREFRONT_ACCOUNT_ALLOWED_ORIGIN_SUFFIX ?? "") || source.CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE !== "platform_resend") identityInvalid();
  let hmacKeyring: StorefrontIdentityKeyring;
  let sealKeyring: StorefrontIdentityKeyring;
  let from: string;
  let apiKey: string;
  try {
    hmacKeyring = parseStorefrontIdentityKeyring(source.CELEBIX_STOREFRONT_ACCOUNT_HMAC_ACTIVE_KEY_ID, source.CELEBIX_STOREFRONT_ACCOUNT_HMAC_KEYS);
    sealKeyring = parseStorefrontIdentityKeyring(source.CELEBIX_STOREFRONT_ACCOUNT_SEAL_ACTIVE_KEY_ID, source.CELEBIX_STOREFRONT_ACCOUNT_SEAL_KEYS);
    from = normalizeStorefrontAccountEmail(source.CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM);
    apiKey = required(source, "CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY", 256);
  } catch { return identityInvalid(); }
  if (hmacKeyring.activeKeyId === sealKeyring.activeKeyId || !from.endsWith("@celebix.test") && !from.endsWith("@celebix.co") && !from.endsWith("@noreply.celebix.net") || !/^re_[A-Za-z0-9_-]{16,200}$/u.test(apiKey)) identityInvalid();
  return Object.freeze({
    mode: "approved_staging",
    allowedOriginSuffix: source.CELEBIX_STOREFRONT_ACCOUNT_ALLOWED_ORIGIN_SUFFIX as StorefrontIdentityConfig["allowedOriginSuffix"],
    hmacKeyring,
    sealKeyring,
    email: Object.freeze({ mode: "platform_resend", from, apiKey }),
  });
}
