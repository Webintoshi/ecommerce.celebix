export const ACCOUNTING_ERROR_CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','durable_authority_invalid','not_found','version_conflict','operation_mismatch','overpayment','currency_mismatch','insufficient_funds','amount_overflow','invalid_transition','unavailable'] as const;
export type AccountingErrorCode=typeof ACCOUNTING_ERROR_CODES[number];
export class AccountingRepositoryError extends Error {readonly code:AccountingErrorCode;constructor(code:AccountingErrorCode){super(code);this.name='AccountingRepositoryError';this.code=code;}}
export function accountingRepositoryErrorCode(error:unknown):AccountingErrorCode|undefined {return error instanceof AccountingRepositoryError?error.code:undefined;}
export function accountingFailure(code:AccountingErrorCode='invalid_input'):never{throw new AccountingRepositoryError(code);}
