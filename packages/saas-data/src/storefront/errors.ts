export type PublicStorefrontErrorCode = "invalid_input" | "not_found" | "unavailable";

export class PublicStorefrontRepositoryError extends Error {
  readonly code: PublicStorefrontErrorCode;
  constructor(code: PublicStorefrontErrorCode) {
    super(code);
    this.name = "PublicStorefrontRepositoryError";
    this.code = code;
  }
}
