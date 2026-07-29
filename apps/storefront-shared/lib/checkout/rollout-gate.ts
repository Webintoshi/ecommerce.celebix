import {
  selectTrustedStorefrontHostAuthority,
  type StorefrontAuthorityHeaders,
} from "../trusted-host-authority.ts";

type CheckoutRolloutEnvironment = Record<string, string | undefined>;

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const INVALID_HOSTNAME_CHARACTERS = /[\u0000-\u0020\u007f-\u009f,:/?#@\\*]/;
const MAX_HOSTNAME_LENGTH = 253;
const MAX_ALLOWLIST_LENGTH = 8_192;
const MAX_ALLOWLIST_HOSTS = 100;

function isCanonicalHostname(value: string): boolean {
  if (
    value.length < 1
    || value.length > MAX_HOSTNAME_LENGTH
    || value !== value.toLowerCase()
    || value.endsWith(".")
    || INVALID_HOSTNAME_CHARACTERS.test(value)
  ) return false;

  const labels = value.split(".");
  return labels.length >= 2
    && labels.every(
      (label) => label.length >= 1
        && label.length <= 63
        && DNS_LABEL.test(label),
    );
}

export function checkoutRolloutAllowsHost(
  source: CheckoutRolloutEnvironment,
  hostname: string,
): boolean {
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_CHECKOUT_ROLLOUT_MODE !== "approved_staging"
    || !isCanonicalHostname(hostname)
  ) return false;

  const encoded = source.CELEBIX_CHECKOUT_ROLLOUT_HOSTS;
  if (
    typeof encoded !== "string"
    || encoded.length < 1
    || encoded.length > MAX_ALLOWLIST_LENGTH
  ) return false;

  const hosts = encoded.split(",");
  if (
    hosts.length < 1
    || hosts.length > MAX_ALLOWLIST_HOSTS
    || hosts.some((host) => !isCanonicalHostname(host))
    || new Set(hosts).size !== hosts.length
  ) return false;

  return hosts.includes(hostname);
}

export function checkoutRolloutAllowsRequest(
  headers: StorefrontAuthorityHeaders,
  source: CheckoutRolloutEnvironment = process.env,
): boolean {
  try {
    const authority = selectTrustedStorefrontHostAuthority(headers, source);
    return authority.kind === "trusted"
      && checkoutRolloutAllowsHost(source, authority.hostname);
  } catch {
    return false;
  }
}
