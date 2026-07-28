const ACCOUNT = /^[a-f0-9]{32}$/;
const BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
type Environment = Record<string, string | undefined>;
export type StagingProductMediaConfig = Readonly<{ accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicOrigin: string }>;
function required(source: Environment, key: string, maximum: number): string { const value = source[key]; if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || CONTROL.test(value)) throw new Error("product_media_config_invalid"); return value; }
export function parseStagingProductMediaConfig(source: Environment): StagingProductMediaConfig {
  if (!source || source.CELEBIX_DEPLOYMENT_TIER !== "staging" || source.CELEBIX_PRODUCT_MEDIA_MODE !== "approved_staging" || source.CELEBIX_R2_MEDIA_ENVIRONMENT !== "staging") throw new Error("product_media_config_invalid");
  const accountId = required(source, "CELEBIX_R2_ACCOUNT_ID", 32); if (!ACCOUNT.test(accountId)) throw new Error("product_media_config_invalid");
  const accessKeyId = required(source, "CELEBIX_R2_ACCESS_KEY_ID", 256);
  const secretAccessKey = required(source, "CELEBIX_R2_SECRET_ACCESS_KEY", 512); if (secretAccessKey.length < 32) throw new Error("product_media_config_invalid");
  const bucket = required(source, "CELEBIX_R2_BUCKET_NAME", 63); if (!BUCKET.test(bucket) || !bucket.includes("staging") || bucket.includes("production")) throw new Error("product_media_config_invalid");
  const publicOrigin = required(source, "CELEBIX_R2_PUBLIC_ORIGIN", 2048); let url: URL; try { url = new URL(publicOrigin); } catch { throw new Error("product_media_config_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port || url.origin !== publicOrigin || !url.hostname.endsWith(".saas-staging.celebix.site") || url.hostname.endsWith(".r2.dev") || url.hostname.endsWith(".r2.cloudflarestorage.com")) throw new Error("product_media_config_invalid");
  return Object.freeze({ accountId, accessKeyId, secretAccessKey, bucket, publicOrigin });
}
