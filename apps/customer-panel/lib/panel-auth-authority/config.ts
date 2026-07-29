import {
  createApprovedStagingSaaSAuthAuthorityProfile,
  type SaaSAuthAuthorityProfile,
} from "../../../../packages/platform-config/src/saas.ts";

const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const ACTIVATION_ID = /^staging_[a-z0-9][a-z0-9_-]{7,95}$/;
const DATABASE_NAME = /^celebix_saas_staging_[a-z0-9][a-z0-9_]{1,47}$/;
const FIELDS = Object.freeze([
  "CELEBIX_SAAS_AUTH_MODE", "CELEBIX_DEPLOYMENT_TIER", "CELEBIX_STAGING_ACTIVATION_ID",
  "CELEBIX_OWNER_ORIGIN", "CELEBIX_PANEL_ORIGIN", "CELEBIX_PLATFORM_DOMAIN_SUFFIX",
  "CELEBIX_SAAS_DATABASE_URL", "CELEBIX_SAAS_DATABASE_NAME", "CELEBIX_BROWSER_INTERNAL_KEY_ID",
  "CELEBIX_BROWSER_INTERNAL_KEY_B64URL", "CELEBIX_CALLBACK_INTERNAL_KEY_ID",
  "CELEBIX_CALLBACK_INTERNAL_KEY_B64URL", "CELEBIX_HANDOFF_KEY_ID", "CELEBIX_HANDOFF_KEY_B64URL",
  "CELEBIX_SESSION_KEY_ID", "CELEBIX_SESSION_KEY_B64URL",
]);

type Environment = Record<string, string | undefined>;

export type CustomerPanelStagingAuthConfig = Readonly<{
  activationId: string;
  authority: SaaSAuthAuthorityProfile;
  database: Readonly<{ url: string; name: string }>;
  keys: Readonly<{
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

function invalid(): never { throw new Error("customer_panel_staging_auth_config_invalid"); }

export function resolveCustomerPanelStagingAuthMode(source: Environment): "disabled" | "approved_staging" {
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

export function parseCustomerPanelStagingAuthConfig(source: Environment): CustomerPanelStagingAuthConfig {
  if (!source || typeof source !== "object" || Array.isArray(source)) invalid();
  const actual = Object.keys(source);
  if (actual.length !== FIELDS.length || actual.some((field) => !FIELDS.includes(field))) invalid();
  if (resolveCustomerPanelStagingAuthMode(source) !== "approved_staging") invalid();
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
  const keys = Object.freeze({
    browserInternalKeyId: keyId(source, "CELEBIX_BROWSER_INTERNAL_KEY_ID"),
    browserInternal: secret(source, "CELEBIX_BROWSER_INTERNAL_KEY_B64URL"),
    callbackInternalKeyId: keyId(source, "CELEBIX_CALLBACK_INTERNAL_KEY_ID"),
    callbackInternal: secret(source, "CELEBIX_CALLBACK_INTERNAL_KEY_B64URL"),
    handoffKeyId: keyId(source, "CELEBIX_HANDOFF_KEY_ID"),
    handoff: secret(source, "CELEBIX_HANDOFF_KEY_B64URL"),
    sessionKeyId: keyId(source, "CELEBIX_SESSION_KEY_ID"),
    session: secret(source, "CELEBIX_SESSION_KEY_B64URL"),
  });
  return Object.freeze({ activationId, authority, database: database(source), keys });
}

export const CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS = FIELDS;
