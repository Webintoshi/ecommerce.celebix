export const CUSTOMER_ERROR_CODES=Object.freeze(["invalid_input","unauthenticated","membership_denied","store_inactive","feature_not_enabled","customer_not_found","customer_conflict","invalid_transition","version_conflict","operation_mismatch","durable_authority_invalid","unavailable"] as const);
export type CustomerErrorCode=(typeof CUSTOMER_ERROR_CODES)[number];
export class CustomerRepositoryError extends Error{readonly code:CustomerErrorCode;constructor(code:CustomerErrorCode){super(code);this.name="CustomerRepositoryError";this.code=code}}
