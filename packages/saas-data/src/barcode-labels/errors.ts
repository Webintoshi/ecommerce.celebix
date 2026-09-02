export const BARCODE_LABEL_ERROR_CODES = Object.freeze([
  "invalid_input",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "resource_not_found",
  "version_conflict",
  "name_conflict",
  "operation_mismatch",
  "durable_authority_invalid",
  "unavailable",
] as const);
export type BarcodeLabelErrorCode = (typeof BARCODE_LABEL_ERROR_CODES)[number];
export class BarcodeLabelRepositoryError extends Error {
  readonly code: BarcodeLabelErrorCode;
  constructor(code: BarcodeLabelErrorCode) {
    super(code);
    this.name = "BarcodeLabelRepositoryError";
    this.code = code;
  }
}
