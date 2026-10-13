export type MerchantPhoneOperatorEnrollmentInput = Readonly<{
  operatorId: string;
  operationId: string;
  principalId: string;
  reason: string;
  phoneKeyId: string;
  phoneDigest: string;
  phoneCiphertext: string;
  phoneMasked: string;
}>;
export type MerchantPhoneOperatorEnrollmentAuthority = Readonly<{
  principalId: string;
  operationId: string;
  phoneMasked: string;
  phoneVerified: boolean;
  securityVersion: number;
}>;
export type MerchantPhoneOperatorEnrollmentResult = Readonly<{
  outcome: 'prepared'|'already_verified'|'operation_replayed'|'operation_mismatch'|'phone_conflict'|'membership_denied'|'invalid_input';
  authority: MerchantPhoneOperatorEnrollmentAuthority|null;
}>;
const keys = ['operatorId','operationId','principalId','reason','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function invalid():never {throw new TypeError('merchant_phone_enrollment_invalid');}
export function parseMerchantPhoneOperatorEnrollment(value: unknown): MerchantPhoneOperatorEnrollmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string,unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(k => typeof row[k] !== 'string') || Object.keys(row).some(k => !keys.includes(k as typeof keys[number]))) invalid();
  const input = row as MerchantPhoneOperatorEnrollmentInput;
  if (![input.operatorId,input.operationId,input.principalId].every(v => uuid.test(v)) || !/^[a-z][a-z0-9_-]{2,31}$/u.test(input.phoneKeyId) || !/^[a-f0-9]{64}$/u.test(input.phoneDigest) || input.reason !== input.reason.trim() || input.reason.length < 10 || input.reason.length > 1000 || input.phoneCiphertext.length < 1 || input.phoneCiphertext.length > 4096 || input.phoneMasked.length < 1 || input.phoneMasked.length > 80) invalid();
  return Object.freeze({...input});
}
