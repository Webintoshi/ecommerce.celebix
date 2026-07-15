export const PANEL_OIDC_CALLBACK_URL = "https://panel.celebix.site/auth/callback";
export const PANEL_HOME_URL = "https://panel.celebix.site/";
export const SELF_SERVE_INTERNAL_CALLBACK_PATH = "/api/internal/self-serve/oidc-callback";
export const SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION = 1;
export const PANEL_SESSION_COMPLETION_SCHEMA_VERSION = 1;
export const PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION = 2;
export const PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES = 4_096;
export const PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN = "celebix-session-handoff-response-v1";
export const PANEL_BROWSER_BOOTSTRAP_URL = "https://panel.celebix.site/auth/bootstrap";
export const PANEL_BROWSER_BINDING_INTERNAL_PATH = "/api/internal/self-serve/browser-binding";
export const PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN = "celebix-panel-browser-bootstrap-request-v1";
export const PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN = "celebix-panel-browser-bootstrap-response-v1";

const EXACT_HTTPS_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;
const DOMAIN_SUFFIX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SaaSAuthAuthorityProfile = Readonly<{
  ownerOrigin: string;
  panelOrigin: string;
  panelCallbackUrl: string;
  panelBootstrapUrl: string;
  panelHomeUrl: string;
  ownerInternalBrowserBindingUrl: string;
  ownerInternalCallbackUrl: string;
  platformDomainSuffix: string;
}>;

const authorityProfiles = new WeakSet<object>();

export const DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE: SaaSAuthAuthorityProfile = Object.freeze({
  ownerOrigin: "https://ecommerce.celebix.co",
  panelOrigin: "https://panel.celebix.site",
  panelCallbackUrl: PANEL_OIDC_CALLBACK_URL,
  panelBootstrapUrl: PANEL_BROWSER_BOOTSTRAP_URL,
  panelHomeUrl: PANEL_HOME_URL,
  ownerInternalBrowserBindingUrl: `https://ecommerce.celebix.co${PANEL_BROWSER_BINDING_INTERNAL_PATH}`,
  ownerInternalCallbackUrl: `https://ecommerce.celebix.co${SELF_SERVE_INTERNAL_CALLBACK_PATH}`,
  platformDomainSuffix: "celebix.site",
});
authorityProfiles.add(DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE);

export function assertSaaSAuthAuthorityProfile(
  value: unknown,
): asserts value is SaaSAuthAuthorityProfile {
  if (
    !value || typeof value !== "object" || !authorityProfiles.has(value) ||
    !Object.isFrozen(value) || !Object.isSealed(value)
  ) throw new Error("saas_auth_authority_profile_invalid");
}

function stagingAuthorityInvalid(): never {
  throw new Error("saas_auth_staging_authority_invalid");
}

function exactHttpsOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !EXACT_HTTPS_ORIGIN.test(value)) {
    return stagingAuthorityInvalid();
  }
  let url: URL;
  try { url = new URL(value); } catch { return stagingAuthorityInvalid(); }
  if (
    url.origin !== value || url.protocol !== "https:" || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash
  ) return stagingAuthorityInvalid();
  return value;
}

export function createApprovedStagingSaaSAuthAuthorityProfile(input: {
  ownerOrigin: string;
  panelOrigin: string;
  platformDomainSuffix: string;
}): SaaSAuthAuthorityProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) stagingAuthorityInvalid();
  const keys = Object.keys(input);
  if (
    keys.length !== 3 ||
    keys.some((key) => !["ownerOrigin", "panelOrigin", "platformDomainSuffix"].includes(key))
  ) stagingAuthorityInvalid();
  const ownerOrigin = exactHttpsOrigin(input.ownerOrigin);
  const panelOrigin = exactHttpsOrigin(input.panelOrigin);
  const platformDomainSuffix = input.platformDomainSuffix;
  if (
    ownerOrigin === panelOrigin || ownerOrigin === "https://ecommerce.celebix.co" ||
    panelOrigin === "https://panel.celebix.site" || platformDomainSuffix === "celebix.site" ||
    typeof platformDomainSuffix !== "string" || platformDomainSuffix.length > 253 ||
    !DOMAIN_SUFFIX.test(platformDomainSuffix)
  ) stagingAuthorityInvalid();
  const profile: SaaSAuthAuthorityProfile = Object.freeze({
    ownerOrigin,
    panelOrigin,
    panelCallbackUrl: `${panelOrigin}/auth/callback`,
    panelBootstrapUrl: `${panelOrigin}/auth/bootstrap`,
    panelHomeUrl: `${panelOrigin}/`,
    ownerInternalBrowserBindingUrl: `${ownerOrigin}${PANEL_BROWSER_BINDING_INTERNAL_PATH}`,
    ownerInternalCallbackUrl: `${ownerOrigin}${SELF_SERVE_INTERNAL_CALLBACK_PATH}`,
    platformDomainSuffix,
  });
  authorityProfiles.add(profile);
  return profile;
}
