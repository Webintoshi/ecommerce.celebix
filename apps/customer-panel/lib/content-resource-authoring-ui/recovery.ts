import { parseContentResourceTarget, type ContentResourceTarget, type MerchantContentKind } from '@celebix/saas-contracts';

export type ContentResourceRecoveryScope = Readonly<{ storeId: string; target: ContentResourceTarget; locale: string }>;
export type ContentResourceRecoveryReceipt = Readonly<ContentResourceRecoveryScope & {
  operationId: string;
  stage: 'outline' | 'draft';
  status: 'unresolved' | 'failed' | 'unknown';
  safeCode: string | null;
}>;

const PREFIX = 'celebix:content-resource-operation:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
function invalid(): never { throw new Error('content_resource_recovery_invalid'); }
function scopeKey(scope: ContentResourceRecoveryScope): string {
  if (!UUID.test(scope.storeId) || !LOCALE.test(scope.locale)) invalid();
  const target = parseContentResourceTarget(scope.target);
  return `${PREFIX}${scope.storeId}:${target.kind}:${target.recordId ?? 'new'}:${target.draftId}:${scope.locale}`;
}
function parseReceipt(raw: string): ContentResourceRecoveryReceipt {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'locale,operationId,safeCode,stage,status,storeId,target') invalid();
  const scope = { storeId: data.storeId, target: data.target, locale: data.locale } as ContentResourceRecoveryScope;
  scopeKey(scope);
  if (typeof data.operationId !== 'string' || !UUID.test(data.operationId) || (data.stage !== 'outline' && data.stage !== 'draft') || !['unresolved', 'failed', 'unknown'].includes(String(data.status)) || (data.safeCode !== null && (typeof data.safeCode !== 'string' || !/^[a-z_]{1,64}$/.test(data.safeCode)))) invalid();
  return Object.freeze({ ...scope, operationId: data.operationId, stage: data.stage, status: data.status, safeCode: data.safeCode }) as ContentResourceRecoveryReceipt;
}
export function readContentResourceRecovery(storage: Storage, scope: ContentResourceRecoveryScope): ContentResourceRecoveryReceipt | null {
  const raw = storage.getItem(scopeKey(scope));
  if (raw === null) return null;
  const receipt = parseReceipt(raw);
  if (receipt.storeId !== scope.storeId || receipt.locale !== scope.locale || receipt.target.kind !== scope.target.kind || receipt.target.draftId !== scope.target.draftId || receipt.target.recordId !== scope.target.recordId) invalid();
  return receipt;
}
export function writeContentResourceRecovery(storage: Storage, receipt: ContentResourceRecoveryReceipt): void {
  const parsed = parseReceipt(JSON.stringify(receipt));
  storage.setItem(scopeKey(parsed), JSON.stringify(parsed));
}
export function clearContentResourceRecovery(storage: Storage, scope: ContentResourceRecoveryScope): void {
  storage.removeItem(scopeKey(scope));
}
/** Find the one unfinished operation for this editor, including its original locale. */
export function recoverContentResourceDraft(storage: Storage, storeId: string, kind: MerchantContentKind, recordId: string | null): Readonly<{ draftId: string; locale: string; status: ContentResourceRecoveryReceipt['status'] }> | null {
  if (!UUID.test(storeId) || !['blog_post', 'page'].includes(kind) || (recordId !== null && !UUID.test(recordId))) invalid();
  const prefix = `${PREFIX}${storeId}:${kind}:${recordId ?? 'new'}:`;
  const found: ContentResourceRecoveryReceipt[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const receipt = parseReceipt(raw);
    if (scopeKey(receipt) !== key) invalid();
    if (receipt.target.recordId === recordId) found.push(receipt);
  }
  if (found.length > 1) invalid();
  return found.length ? Object.freeze({ draftId: found[0]!.target.draftId, locale: found[0]!.locale, status: found[0]!.status }) : null;
}
