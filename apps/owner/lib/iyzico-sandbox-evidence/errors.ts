export const IYZICO_SANDBOX_EVIDENCE_OPERATOR_ERROR_CODES = Object.freeze([
  "invalid_input",
  "prerequisite_unavailable",
  "scenario_failed",
  "commit_unknown",
  "concurrent_run",
  "unavailable",
] as const);

export type IyzicoSandboxEvidenceOperatorErrorCode =
  (typeof IYZICO_SANDBOX_EVIDENCE_OPERATOR_ERROR_CODES)[number];

const CODES = new Set<string>(IYZICO_SANDBOX_EVIDENCE_OPERATOR_ERROR_CODES);

export class IyzicoSandboxEvidenceOperatorError extends Error {
  readonly code: IyzicoSandboxEvidenceOperatorErrorCode;

  constructor(code: IyzicoSandboxEvidenceOperatorErrorCode) {
    if (!CODES.has(code)) throw new TypeError("iyzico_sandbox_evidence_operator_error_invalid");
    super(code);
    this.code = code;
    Object.defineProperties(this, {
      code: { enumerable: true, writable: false },
      message: { enumerable: false, writable: false },
      name: {
        enumerable: false,
        writable: false,
        value: "IyzicoSandboxEvidenceOperatorError",
      },
    });
    Object.freeze(this);
  }
}

class TrustedIyzicoSandboxEvidenceOperatorError extends IyzicoSandboxEvidenceOperatorError {}

export function trustedOperatorError(
  code: IyzicoSandboxEvidenceOperatorErrorCode,
): IyzicoSandboxEvidenceOperatorError {
  return new TrustedIyzicoSandboxEvidenceOperatorError(code);
}

export function isTrustedOperatorError(
  value: unknown,
): value is IyzicoSandboxEvidenceOperatorError {
  return value instanceof TrustedIyzicoSandboxEvidenceOperatorError;
}
