export const GOOGLE_MERCHANT_ERROR_CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','wrong_domain','needs_reconnect','not_connected','operation_mismatch','commit_unknown','unavailable'] as const;
export type GoogleMerchantErrorCode=typeof GOOGLE_MERCHANT_ERROR_CODES[number];
export class GoogleMerchantRepositoryError extends Error{readonly code:GoogleMerchantErrorCode;constructor(code:GoogleMerchantErrorCode){super(code);this.code=code;this.name='GoogleMerchantRepositoryError';}}
export function googleMerchantErrorCode(error:unknown):GoogleMerchantErrorCode{return error instanceof GoogleMerchantRepositoryError?error.code:'unavailable';}
export function merchantFailure(code:GoogleMerchantErrorCode='unavailable'):never{throw new GoogleMerchantRepositoryError(code);}
