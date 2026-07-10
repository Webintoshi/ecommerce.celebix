import {
  SAAS_CONTRACT_SCHEMA_VERSION,
  type SaaSContractError,
  type SaaSErrorCode,
} from "@celebix/saas-contracts";

export type StorefrontResolutionErrorCode = Extract<
  SaaSErrorCode,
  "invalid_input" | "host_not_found" | "host_unverified" | "ambiguous_host" | "store_inactive" | "host_store_mismatch"
>;

const SAFE_MESSAGES: Record<StorefrontResolutionErrorCode, string> = {
  invalid_input: "The storefront host input is invalid.",
  host_not_found: "No storefront is configured for this hostname.",
  host_unverified: "This storefront hostname is not verified.",
  ambiguous_host: "This storefront hostname has ambiguous ownership.",
  store_inactive: "This storefront is not active.",
  host_store_mismatch: "The hostname does not match the resolved storefront.",
};

export class StorefrontResolutionError extends Error implements SaaSContractError {
  readonly schemaVersion = SAAS_CONTRACT_SCHEMA_VERSION;
  readonly retryable = false;
  readonly safeMessage: string;
  readonly code: StorefrontResolutionErrorCode;

  constructor(code: StorefrontResolutionErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "StorefrontResolutionError";
    this.code = code;
    this.safeMessage = SAFE_MESSAGES[code];
  }
}
