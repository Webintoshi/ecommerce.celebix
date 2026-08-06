import type { StorefrontCredentialRead } from "../cart/credential.ts";
import {
  createStorefrontOperationCredential,
  credentialDigestCandidates,
  readStorefrontCredentialCookie,
  serializeStorefrontCredentialCookie,
  serializeStorefrontCredentialDeletionCookie,
  type StorefrontCommerceCredentialKeyring,
} from "../cart/credential.ts";

export function createStandardHostedCheckoutCredential(
  keyring: StorefrontCommerceCredentialKeyring,
  operationId: string,
) {
  return createStorefrontOperationCredential("hosted_checkout", operationId, keyring);
}

export function standardHostedCheckoutDigestCandidates(
  value: string,
  keyring: StorefrontCommerceCredentialKeyring,
) {
  return credentialDigestCandidates("hosted_checkout", value, keyring);
}

export function readStandardHostedCheckoutCookie(cookieHeader: string | null): StorefrontCredentialRead {
  return readStorefrontCredentialCookie("hosted_checkout", cookieHeader);
}

export function serializeStandardHostedCheckoutCookie(value: string): string {
  return serializeStorefrontCredentialCookie("hosted_checkout", value);
}

export function serializeStandardHostedCheckoutDeletionCookie(): string {
  return serializeStorefrontCredentialDeletionCookie("hosted_checkout");
}
