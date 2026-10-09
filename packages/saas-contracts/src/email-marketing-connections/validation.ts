import { EMAIL_MARKETING_PROVIDERS, type EmailMarketingProvider, type EmailMarketingConnection, type EmailMarketingAudiencePreview, type EmailMarketingOverview, type EmailMarketingSelection, type EmailMarketingApplyIntent, type EmailMarketingList, type EmailMarketingAccount } from './index.ts';
export function emailMarketingInvalid(): never { throw new TypeError('email_marketing_invalid'); }
export function emailMarketingObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) emailMarketingInvalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) emailMarketingInvalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key)) || required.some(key => !Object.hasOwn(descriptors, key))) emailMarketingInvalid();
  const output: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string') emailMarketingInvalid();
    const desc = descriptors[key];
    if (!desc || !('value' in desc) || !desc.enumerable) emailMarketingInvalid();
    output[key] = desc.value;
  }
  return output;
}
export function emailMarketingText(value: unknown, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x1f\x7f<>]/u.test(value)) emailMarketingInvalid();
  return value;
}
export function emailMarketingUuid(value: unknown): string {
  const text = emailMarketingText(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) emailMarketingInvalid();
  return text;
}
export function emailMarketingInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) emailMarketingInvalid();
  return value as number;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T { if (!choices.includes(value as T)) emailMarketingInvalid(); return value as T; }
function nullableText(value: unknown, max = 160): string | null { return value === null ? null : emailMarketingText(value, max); }
function time(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) emailMarketingInvalid();
  return value;
}
function nullableTime(value: unknown): string | null { return value === null ? null : time(value); }
export function parseEmailMarketingProvider(value: unknown): EmailMarketingProvider { return choice(value, EMAIL_MARKETING_PROVIDERS); }
export function parseEmailMarketingConnection(value: unknown): EmailMarketingConnection {
  const v = emailMarketingObject(value, ['id','provider','version','generation','credentialVersion','accountId','accountName','listId','listName','status','senderStatus','lastCheckedAt','lastSyncedAt','errorCode']);
  return Object.freeze({id: emailMarketingUuid(v.id), provider: parseEmailMarketingProvider(v.provider), version: emailMarketingInteger(v.version), generation: emailMarketingInteger(v.generation, 1), credentialVersion: emailMarketingInteger(v.credentialVersion, 1), accountId: nullableText(v.accountId), accountName: nullableText(v.accountName), listId: nullableText(v.listId), listName: nullableText(v.listName), status: choice(v.status, ['disconnected','connected','draining','needs_reconnect','error']), senderStatus: choice(v.senderStatus, ['verified','pending','unknown']), lastCheckedAt: nullableTime(v.lastCheckedAt), lastSyncedAt: nullableTime(v.lastSyncedAt), errorCode: nullableText(v.errorCode, 80)});
}
export function parseEmailMarketingSelection(value: unknown): EmailMarketingSelection {
  const common = emailMarketingObject(value, ['kind'], ['listId','name']);
  if (common.kind === 'existing') { const v = emailMarketingObject(value, ['kind','listId']); return Object.freeze({kind:'existing', listId:emailMarketingText(v.listId)}); }
  const v = emailMarketingObject(value, ['kind','name']);
  if (v.kind !== 'create') emailMarketingInvalid();
  return Object.freeze({kind:'create', name:emailMarketingText(v.name, 100)});
}
export function parseEmailMarketingApplyIntent(value: unknown): EmailMarketingApplyIntent {
  const v = emailMarketingObject(value, ['candidateId','expectedVersion','selection']);
  return Object.freeze({candidateId: emailMarketingUuid(v.candidateId), expectedVersion: emailMarketingInteger(v.expectedVersion), selection: parseEmailMarketingSelection(v.selection)});
}
export function parseEmailMarketingAudiencePreview(value: unknown): EmailMarketingAudiencePreview {
  const v = emailMarketingObject(value, ['eligible','denied','missingEvidence','needsRenewal','providerBlocked','unchecked','overLimit','providerCheckedAt']);
  return Object.freeze({eligible:emailMarketingInteger(v.eligible), denied:emailMarketingInteger(v.denied), missingEvidence:emailMarketingInteger(v.missingEvidence), needsRenewal:emailMarketingInteger(v.needsRenewal), providerBlocked:v.providerBlocked===null?null:emailMarketingInteger(v.providerBlocked), unchecked:emailMarketingInteger(v.unchecked), overLimit:v.overLimit===null?null:emailMarketingInteger(v.overLimit), providerCheckedAt:nullableTime(v.providerCheckedAt)});
}
export function parseEmailMarketingList(value: unknown): EmailMarketingList {
  const v=emailMarketingObject(value,['id','name']);return Object.freeze({id:emailMarketingText(v.id),name:emailMarketingText(v.name)});
}
export function parseEmailMarketingAccount(value: unknown): EmailMarketingAccount {
  const v=emailMarketingObject(value,['id','name','senderStatus']);return Object.freeze({id:emailMarketingText(v.id),name:emailMarketingText(v.name),senderStatus:choice(v.senderStatus,['verified','pending','unknown'])});
}
export function parseEmailMarketingOverview(value: unknown): EmailMarketingOverview {
  const v=emailMarketingObject(value,['connections','sync','configured']);
  if(typeof v.configured!=='boolean'||!Array.isArray(v.connections)||v.connections.length>20)emailMarketingInvalid();
  const descriptors=Object.getOwnPropertyDescriptors(v.connections);
  if(Reflect.ownKeys(descriptors).length!==v.connections.length+1)emailMarketingInvalid();
  const connections:EmailMarketingConnection[]=[];
  for(let i=0;i<v.connections.length;i++){const d=descriptors[String(i)];if(!d||!('value' in d)||!d.enumerable)emailMarketingInvalid();connections.push(parseEmailMarketingConnection(d.value));}
  const s=emailMarketingObject(v.sync,['queued','verified','blocked','failed','pendingVerification','asOf','suppressionCheckedAt']);
  return Object.freeze({connections:Object.freeze(connections),configured:v.configured,sync:Object.freeze({queued:emailMarketingInteger(s.queued),verified:emailMarketingInteger(s.verified),blocked:emailMarketingInteger(s.blocked),failed:emailMarketingInteger(s.failed),pendingVerification:emailMarketingInteger(s.pendingVerification),asOf:time(s.asOf),suppressionCheckedAt:nullableTime(s.suppressionCheckedAt)})});
}
