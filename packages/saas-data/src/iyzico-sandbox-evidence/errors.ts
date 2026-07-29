export const IYZICO_SANDBOX_EVIDENCE_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "provider_disabled",
  "operation_mismatch",
  "profile_not_found",
  "profile_not_eligible",
  "profile_not_active",
  "version_conflict",
  "already_bound",
  "durable_authority_invalid",
  "run_not_found",
  "run_closed",
  "lease_conflict",
  "stale_evidence",
  "lease_lost",
  "case_not_found",
  "callback_mismatch",
  "timeout_mismatch",
  "evidence_incomplete",
  "evidence_mismatch",
  "single_provider_boundary_invalid",
  "method_not_found",
  "invalid_transition",
  "already_active",
  "attestation_not_found",
  "provider_already_active",
  "unavailable",
  "commit_unknown",
] as const);

export type IyzicoSandboxEvidenceErrorCode =
  (typeof IYZICO_SANDBOX_EVIDENCE_ERROR_CODES)[number];

const CODES = new Set<string>(IYZICO_SANDBOX_EVIDENCE_ERROR_CODES);

export class IyzicoSandboxEvidenceRepositoryError extends Error {
  readonly code: IyzicoSandboxEvidenceErrorCode;

  constructor(code: IyzicoSandboxEvidenceErrorCode) {
    if (!CODES.has(code)) throw new TypeError("iyzico_sandbox_evidence_error_code_invalid");
    super(code);
    this.code = code;
    Object.defineProperties(this, {
      code: { enumerable: true, writable: false },
      message: { enumerable: false, writable: false },
      name: {
        enumerable: false,
        writable: false,
        value: "IyzicoSandboxEvidenceRepositoryError",
      },
    });
    Object.freeze(this);
  }
}

class TrustedIyzicoSandboxEvidenceRepositoryError
  extends IyzicoSandboxEvidenceRepositoryError {}

export function trustedIyzicoSandboxEvidenceError(
  code: IyzicoSandboxEvidenceErrorCode,
): IyzicoSandboxEvidenceRepositoryError {
  return new TrustedIyzicoSandboxEvidenceRepositoryError(code);
}

export function isTrustedIyzicoSandboxEvidenceError(
  value: unknown,
): value is IyzicoSandboxEvidenceRepositoryError {
  return value instanceof TrustedIyzicoSandboxEvidenceRepositoryError;
}
