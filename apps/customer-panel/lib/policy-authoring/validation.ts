import { FIXED_STOREFRONT_POLICIES, parseToshiCreditWallet, type StorefrontPolicyKey } from '@celebix/saas-contracts';
import { POLICY_AUTHORING_CREDIT_COST, type PolicyAuthoringRequest, type PolicyAuthoringResult } from './types.ts';

export const POLICY_AUTHORING_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const BAD_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
function invalid(): never { throw new TypeError('policy_authoring_contract_invalid'); }
export function exactPolicyObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key) || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) invalid();
  return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}
export function policyText(value: unknown, maxBytes: number, nonempty = false): string {
  if (typeof value !== 'string' || BAD_TEXT.test(value) || new TextEncoder().encode(value).byteLength > maxBytes || nonempty && !value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{M}\u2800]/gu, '')) invalid();
  return value;
}
function uuid(value: unknown): string { const id = policyText(value, 36); if (!POLICY_AUTHORING_UUID.test(id)) invalid(); return id; }
function version(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) invalid(); return value as number; }
export function policyKey(value: unknown): StorefrontPolicyKey { const definition = FIXED_STOREFRONT_POLICIES.find(item => item.key === value); if (!definition) invalid(); return definition.key; }
export function policyDigest(value: unknown): string { const digest = policyText(value, 64); if (!/^[a-f0-9]{64}$/u.test(digest)) invalid(); return digest; }
export function policySuggestions(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 8) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  return Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const item = descriptors[String(index)]; if (!item?.enumerable || !('value' in item)) invalid();
    const text = policyText(item.value, 600, true); if (/[<>]/u.test(text)) invalid(); return text;
  }));
}
export function policySafeBody(value: unknown): string {
  const body = policyText(value, 100_000, true);
  if (!body.replace(/<[^>]*>/gu, '').replace(/&(?:nbsp|#160|#x0*a0);/giu, ' ').replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{M}\u2800]/gu, '')) invalid();
  if (/<(?!\/?(?:p|br|strong|em|u|del|ul|ol|li|h2|h3|h4|blockquote|hr|table|thead|tbody|tr|th|td)\s*\/?>)/iu.test(body)) invalid();
  return body;
}
export function parsePolicyAuthoringRequest(value: unknown): PolicyAuthoringRequest {
  const raw = exactPolicyObject(value, ['kind', 'draftId', 'policyKey', 'policyVersion', 'currentBody', 'locale']);
  if (raw.kind !== 'policy' || raw.locale !== 'tr') invalid();
  return Object.freeze({ kind: 'policy', draftId: uuid(raw.draftId), policyKey: policyKey(raw.policyKey), policyVersion: version(raw.policyVersion), currentBody: policyText(raw.currentBody, 100_000), locale: 'tr' });
}
export function parsePolicyAuthoringResult(value: unknown, expected?: Readonly<{ request: PolicyAuthoringRequest; operationId: string }>): PolicyAuthoringResult {
  const raw = exactPolicyObject(value, ['kind', 'operationId', 'draftId', 'policyKey', 'policyVersion', 'requestFingerprint', 'body', 'suggestions', 'chargedCredits', 'wallet']);
  if (raw.kind !== 'policy' || raw.chargedCredits !== POLICY_AUTHORING_CREDIT_COST) invalid();
  const result: PolicyAuthoringResult = Object.freeze({ kind: 'policy', operationId: uuid(raw.operationId), draftId: uuid(raw.draftId), policyKey: policyKey(raw.policyKey), policyVersion: version(raw.policyVersion), requestFingerprint: policyDigest(raw.requestFingerprint), body: policySafeBody(raw.body), suggestions: policySuggestions(raw.suggestions), chargedCredits: POLICY_AUTHORING_CREDIT_COST, wallet: parseToshiCreditWallet(raw.wallet) });
  if (expected) {
    const request = parsePolicyAuthoringRequest(expected.request);
    if (result.operationId !== expected.operationId || result.draftId !== request.draftId || result.policyKey !== request.policyKey || result.policyVersion !== request.policyVersion) invalid();
  }
  return result;
}
