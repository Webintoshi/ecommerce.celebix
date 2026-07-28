export const STOREFRONT_DATA_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_DEPLOYMENT_TIER", "CELEBIX_STOREFRONT_DATA_MODE", "CELEBIX_SAAS_DATABASE_NAME",
  "CELEBIX_SAAS_DATABASE_URL", "CELEBIX_R2_MEDIA_ENVIRONMENT", "CELEBIX_R2_PUBLIC_ORIGIN",
] as const);

type Environment = Record<string, string | undefined>;
export type StorefrontDataConfig = Readonly<{ database: Readonly<{ name: string; url: string }>; mediaOrigin: string }>;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
function invalid(): never { throw new Error("storefront_data_config_invalid"); }
function required(source: Environment, name: string, maximum = 4_096): string { const value = source[name]; if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || CONTROL.test(value)) invalid(); return value; }

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
