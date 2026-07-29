import {
  createApprovedStagingSaaSAuthAuthorityProfile,
  type SaaSAuthAuthorityProfile,
} from "../../../../packages/platform-config/src/saas.ts";

const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const ACTIVATION_ID = /^staging_[a-z0-9][a-z0-9_-]{7,95}$/;
const DATABASE_NAME = /^celebix_saas_staging_[a-z0-9][a-z0-9_]{1,47}$/;
const SAFE_ALGORITHMS = new Set([
  "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA",
]);

const FIELDS = Object.freeze([
  "CELEBIX_SAAS_AUTH_MODE", "CELEBIX_DEPLOYMENT_TIER", "CELEBIX_STAGING_ACTIVATION_ID",
  "CELEBIX_OWNER_ORIGIN", "CELEBIX_PANEL_ORIGIN", "CELEBIX_PLATFORM_DOMAIN_SUFFIX",
  "CELEBIX_SAAS_DATABASE_URL", "CELEBIX_SAAS_DATABASE_NAME", "CELEBIX_LOGTO_ISSUER",
  "CELEBIX_LOGTO_DISCOVERY_URL", "CELEBIX_LOGTO_CLIENT_ID", "CELEBIX_LOGTO_CLIENT_SECRET",
  "CELEBIX_LOGTO_TOKEN_AUTH_METHOD", "CELEBIX_LOGTO_ID_TOKEN_ALGS",
  "CELEBIX_IDENTITY_HMAC_KEY_B64URL", "CELEBIX_IDENTITY_ENCRYPTION_KEY_ID",
  "CELEBIX_IDENTITY_ENCRYPTION_KEY_B64URL", "CELEBIX_BROWSER_BOOTSTRAP_KEY_ID",
  "CELEBIX_BROWSER_BOOTSTRAP_KEY_B64URL", "CELEBIX_BROWSER_BINDING_KEY_ID",
  "CELEBIX_BROWSER_BINDING_KEY_B64URL", "CELEBIX_BROWSER_INTERNAL_KEY_ID",
  "CELEBIX_BROWSER_INTERNAL_KEY_B64URL", "CELEBIX_CALLBACK_INTERNAL_KEY_ID",
  "CELEBIX_CALLBACK_INTERNAL_KEY_B64URL", "CELEBIX_HANDOFF_KEY_ID", "CELEBIX_HANDOFF_KEY_B64URL",
  "CELEBIX_SESSION_KEY_ID", "CELEBIX_SESSION_KEY_B64URL",
]);

type Environment = Record<string, string | undefined>;

export type OwnerStagingAuthConfig = Readonly<{
  activationId: string;
  authority: SaaSAuthAuthorityProfile;
  database: Readonly<{ url: string; name: string }>;
  logto: Readonly<{
    issuer: string;
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
    tokenAuthMethod: "client_secret_basic" | "client_secret_post";
    algorithms: readonly string[];
  }>;
  keys: Readonly<{
    identityHmac: Uint8Array;
    identityEncryptionKeyId: string;
    identityEncryption: Uint8Array;
    browserBootstrapKeyId: string;
    browserBootstrap: Uint8Array;
    browserBindingKeyId: string;
    browserBinding: Uint8Array;
    browserInternalKeyId: string;
    browserInternal: Uint8Array;
    callbackInternalKeyId: string;
    callbackInternal: Uint8Array;
    handoffKeyId: string;
    handoff: Uint8Array;
    sessionKeyId: string;
    session: Uint8Array;
  }>;
}>;

function invalid(): never { throw new Error("owner_staging_auth_config_invalid"); }

export function resolveOwnerStagingAuthMode(source: Environment): "disabled" | "approved_staging" {
  const mode = source.CELEBIX_SAAS_AUTH_MODE;
  const tier = source.CELEBIX_DEPLOYMENT_TIER;
  return mode === "approved_staging" && tier === "staging" ? "approved_staging" : "disabled";
}

function required(source: Environment, name: string, maximum = 4096): string {
  const value = source[name];
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}

function keyId(source: Environment, name: string): string {
  const value = required(source, name, 64);
  if (!KEY_ID.test(value) || value.includes("..")) invalid();
  return value;
}

function secret(source: Environment, name: string): Uint8Array {
  const value = required(source, name, 64);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) invalid();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    decoded.fill(0);
    invalid();
  }
  const copied = new Uint8Array(decoded);
  decoded.fill(0);
  return copied;
}

function exactHttpsUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.toString() !== value
  ) invalid();
  return parsed;
}

function database(source: Environment): Readonly<{ url: string; name: string }> {
  const name = required(source, "CELEBIX_SAAS_DATABASE_NAME", 63);
  if (!DATABASE_NAME.test(name)) invalid();
  const value = required(source, "CELEBIX_SAAS_DATABASE_URL", 4096);
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password ||
    url.hash || url.pathname !== `/${name}` || url.searchParams.size !== 1 ||
    url.searchParams.get("sslmode") !== "require"
  ) invalid();
  return Object.freeze({ url: value, name });
}

export function parseOwnerStagingAuthConfig(source: Environment): OwnerStagingAuthConfig {
  if (!source || typeof source !== "object" || Array.isArray(source)) invalid();
  const actual = Object.keys(source);
  if (actual.length !== FIELDS.length || actual.some((field) => !FIELDS.includes(field))) invalid();
  if (resolveOwnerStagingAuthMode(source) !== "approved_staging") invalid();
  const activationId = required(source, "CELEBIX_STAGING_ACTIVATION_ID", 96);
  if (!ACTIVATION_ID.test(activationId)) invalid();
  let authority: SaaSAuthAuthorityProfile;
  try {
    authority = createApprovedStagingSaaSAuthAuthorityProfile({
      ownerOrigin: required(source, "CELEBIX_OWNER_ORIGIN", 2048),
      panelOrigin: required(source, "CELEBIX_PANEL_ORIGIN", 2048),
      platformDomainSuffix: required(source, "CELEBIX_PLATFORM_DOMAIN_SUFFIX", 253),
    });
  } catch { return invalid(); }
  const issuer = required(source, "CELEBIX_LOGTO_ISSUER", 2048);
  const discoveryUrl = required(source, "CELEBIX_LOGTO_DISCOVERY_URL", 2048);
  const parsedIssuer = exactHttpsUrl(issuer);
  const parsedDiscovery = exactHttpsUrl(discoveryUrl);
  if (
    parsedDiscovery.origin !== parsedIssuer.origin ||
    parsedDiscovery.pathname !== `${parsedIssuer.pathname.replace(/\/$/, "")}/.well-known/openid-configuration`
  ) invalid();
  const clientId = required(source, "CELEBIX_LOGTO_CLIENT_ID", 256);
  const clientSecret = required(source, "CELEBIX_LOGTO_CLIENT_SECRET", 1024);
  const tokenAuthMethod = required(source, "CELEBIX_LOGTO_TOKEN_AUTH_METHOD", 64);
  if (tokenAuthMethod !== "client_secret_basic" && tokenAuthMethod !== "client_secret_post") invalid();
  const algorithmText = required(source, "CELEBIX_LOGTO_ID_TOKEN_ALGS", 256);
  const algorithms = algorithmText.split(",");
  if (
    algorithms.length < 1 || algorithms.length > 8 || new Set(algorithms).size !== algorithms.length ||
    algorithms.some((algorithm) => !SAFE_ALGORITHMS.has(algorithm)) || algorithms.join(",") !== algorithmText
  ) invalid();
  const keys = Object.freeze({
    identityHmac: secret(source, "CELEBIX_IDENTITY_HMAC_KEY_B64URL"),
    identityEncryptionKeyId: keyId(source, "CELEBIX_IDENTITY_ENCRYPTION_KEY_ID"),
    identityEncryption: secret(source, "CELEBIX_IDENTITY_ENCRYPTION_KEY_B64URL"),
    browserBootstrapKeyId: keyId(source, "CELEBIX_BROWSER_BOOTSTRAP_KEY_ID"),
    browserBootstrap: secret(source, "CELEBIX_BROWSER_BOOTSTRAP_KEY_B64URL"),
    browserBindingKeyId: keyId(source, "CELEBIX_BROWSER_BINDING_KEY_ID"),
    browserBinding: secret(source, "CELEBIX_BROWSER_BINDING_KEY_B64URL"),
    browserInternalKeyId: keyId(source, "CELEBIX_BROWSER_INTERNAL_KEY_ID"),
    browserInternal: secret(source, "CELEBIX_BROWSER_INTERNAL_KEY_B64URL"),
    callbackInternalKeyId: keyId(source, "CELEBIX_CALLBACK_INTERNAL_KEY_ID"),
    callbackInternal: secret(source, "CELEBIX_CALLBACK_INTERNAL_KEY_B64URL"),
    handoffKeyId: keyId(source, "CELEBIX_HANDOFF_KEY_ID"),
    handoff: secret(source, "CELEBIX_HANDOFF_KEY_B64URL"),
    sessionKeyId: keyId(source, "CELEBIX_SESSION_KEY_ID"),
    session: secret(source, "CELEBIX_SESSION_KEY_B64URL"),
  });
  return Object.freeze({
    activationId,
    authority,
    database: database(source),
    logto: Object.freeze({
      issuer,
      discoveryUrl,
      clientId,
      clientSecret,
      tokenAuthMethod,
      algorithms: Object.freeze([...algorithms]),
    }),
    keys,
  });
}

export const OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS = FIELDS;
