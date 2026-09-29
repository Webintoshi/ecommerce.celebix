import type { ContentResourceTarget } from './types.ts';
import { parseContentResourceTarget } from './validation.ts';

export type ContentResearchUsage = Readonly<{ sourcesAttempted: number; fetchedBytes: number; extractedBytes: number; elapsedMs: number }>;
export type ContentResearchRequest = Readonly<{ target: ContentResourceTarget; urls: readonly string[] }>;
export type ContentResearchSource = Readonly<{ id: string; originalUrl: string; finalUrl: string; title: string; fetchedAt: string; contentSha256: string; extractedText: string; byteCount: number }>;
export type ContentResearchSafeSource = Readonly<Omit<ContentResearchSource, 'extractedText'>>;
export type ContentResearchResult = Readonly<{ operationId: string; status: 'pending' | 'completed' | 'failed' | 'unknown'; sources: readonly ContentResearchSafeSource[]; usage: ContentResearchUsage | null; safeCode: string | null }>;
export type ContentResearchStoredOperation = Readonly<Omit<ContentResearchResult, 'sources'> & { sources: readonly ContentResearchSource[]; target: ContentResourceTarget; requestFingerprint: string; version: number; dispatchState: 'not_dispatched' | 'dispatched' | 'unknown'; claimToken: string | null; leaseExpiresAt: string | null }>;

const encoder = new TextEncoder();
const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DENIED_TLD = /\.(?:local|localhost|internal|lan|home)$/;
function invalid(): never { throw new TypeError('content_research_contract_invalid'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(name => typeof name !== 'string' || !keys.includes(name)) || keys.some(name => !Object.hasOwn(descriptors, name))) invalid();
  const out: Record<string, unknown> = {};
  for (const key of keys) { const d = descriptors[key]!; if (!d.enumerable || !('value' in d)) invalid(); out[key] = d.value; }
  return out;
}
function array(value: unknown, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) invalid();
  const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
  if (keys.length !== value.length + 1) invalid();
  return Array.from({ length: value.length }, (_, index) => { const item = d[String(index)]; if (!item?.enumerable || !('value' in item)) invalid(); return item.value; });
}
function text(value: unknown, max: number, min = 0, lines = false): string {
  if (typeof value !== 'string' || BAD.test(value) || (!lines && /[\r\n\t]/.test(value))) invalid();
  const bytes = encoder.encode(value).length;
  if (bytes < min || bytes > max) invalid();
  return value;
}
function uuid(value: unknown): string { const s = text(value, 36, 36); if (!UUID.test(s)) invalid(); return s; }
function hash(value: unknown): string { const s = text(value, 64, 64); if (!SHA.test(s)) invalid(); return s; }
function integer(value: unknown, max: number, min = 0): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
function stamp(value: unknown): string { const s = text(value, 24, 24); try { if (new Date(s).toISOString() !== s) invalid(); } catch { invalid(); } return s; }
function choice<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== 'string' || !allowed.includes(value as T)) invalid(); return value as T; }
export function parseContentResearchUrl(value: unknown): string {
  const source = text(value, 2048, 1);
  if (/%(?![a-f0-9]{2})/i.test(source)) invalid();
  let url: URL; try { url = new URL(source); } catch { invalid(); }
  if (url.href !== source || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.hostname.length > 253 || !HOST.test(url.hostname) || DENIED_TLD.test(url.hostname)) invalid();
  return source;
}
export function parseContentResearchRequest(value: unknown): ContentResearchRequest {
  const r = object(value, ['target', 'urls']), urls = Object.freeze(array(r.urls, 1, 3).map(parseContentResearchUrl));
  if (new Set(urls).size !== urls.length) invalid();
  return Object.freeze({ target: parseContentResourceTarget(r.target), urls });
}
export function parseContentResearchUsage(value: unknown): ContentResearchUsage {
  const r = object(value, ['sourcesAttempted', 'fetchedBytes', 'extractedBytes', 'elapsedMs']);
  const usage = { sourcesAttempted: integer(r.sourcesAttempted, 3), fetchedBytes: integer(r.fetchedBytes, 3 * 524288), extractedBytes: integer(r.extractedBytes, 32000), elapsedMs: integer(r.elapsedMs, 60000) };
  if ((usage.sourcesAttempted === 0 && (usage.fetchedBytes !== 0 || usage.extractedBytes !== 0)) || usage.extractedBytes > usage.fetchedBytes) invalid();
  return Object.freeze(usage);
}
export function parseContentResearchSource(value: unknown): ContentResearchSource {
  const r = object(value, ['id', 'originalUrl', 'finalUrl', 'title', 'fetchedAt', 'contentSha256', 'extractedText', 'byteCount']);
  const extractedText = text(r.extractedText, 12000, 1, true);
  return Object.freeze({ id: uuid(r.id), originalUrl: parseContentResearchUrl(r.originalUrl), finalUrl: parseContentResearchUrl(r.finalUrl), title: text(r.title, 500), fetchedAt: stamp(r.fetchedAt), contentSha256: hash(r.contentSha256), extractedText, byteCount: integer(r.byteCount, 524288, 1) });
}
function safeSource(value: unknown): ContentResearchSafeSource {
  const r = object(value, ['id', 'originalUrl', 'finalUrl', 'title', 'fetchedAt', 'contentSha256', 'byteCount']);
  return Object.freeze({ id: uuid(r.id), originalUrl: parseContentResearchUrl(r.originalUrl), finalUrl: parseContentResearchUrl(r.finalUrl), title: text(r.title, 500), fetchedAt: stamp(r.fetchedAt), contentSha256: hash(r.contentSha256), byteCount: integer(r.byteCount, 524288, 1) });
}
function state(value: unknown, privateSources: boolean) {
  const r = object(value, privateSources ? ['operationId','status','sources','usage','safeCode','target','requestFingerprint','version','dispatchState','claimToken','leaseExpiresAt'] : ['operationId','status','sources','usage','safeCode']);
  const status = choice(r.status, ['pending','completed','failed','unknown']), sources = Object.freeze(array(r.sources, 0, 3).map(privateSources ? parseContentResearchSource : safeSource)), usage = r.usage === null ? null : parseContentResearchUsage(r.usage);
  if (usage === null && status !== 'unknown') invalid();
  const bytes = privateSources ? sources.reduce((total, source) => total + encoder.encode((source as ContentResearchSource).extractedText).length, 0) : 0;
  if (bytes > 32000 || (status === 'completed' ? sources.length < 1 || usage!.sourcesAttempted !== sources.length : sources.length !== 0)) invalid();
  if (status === 'completed' && (usage!.fetchedBytes !== sources.reduce((sum, item) => sum + item.byteCount, 0) || (privateSources && usage!.extractedBytes !== bytes))) invalid();
  if (status === 'pending' && (usage!.sourcesAttempted !== 0 || usage!.fetchedBytes !== 0 || usage!.extractedBytes !== 0 || usage!.elapsedMs !== 0)) invalid();
  const safeCode = r.safeCode === null ? null : text(r.safeCode, 64, 1);
  if ((status === 'pending' || status === 'completed') !== (safeCode === null)) invalid();
  const base = { operationId: uuid(r.operationId), status, sources, usage, safeCode };
  if (!privateSources) return Object.freeze(base);
  const dispatchState = choice(r.dispatchState, ['not_dispatched','dispatched','unknown']), claimToken = r.claimToken === null ? null : uuid(r.claimToken), leaseExpiresAt = r.leaseExpiresAt === null ? null : stamp(r.leaseExpiresAt);
  if ((status === 'pending') !== (leaseExpiresAt !== null) || (dispatchState === 'not_dispatched' && claimToken !== null) || (dispatchState === 'dispatched' && claimToken === null)) invalid();
  return Object.freeze({ ...base, target: parseContentResourceTarget(r.target), requestFingerprint: hash(r.requestFingerprint), version: integer(r.version, Number.MAX_SAFE_INTEGER, 1), dispatchState, claimToken, leaseExpiresAt });
}
export function parseContentResearchResult(value: unknown): ContentResearchResult { return state(value, false) as ContentResearchResult; }
export function parseContentResearchStoredOperation(value: unknown): ContentResearchStoredOperation { return state(value, true) as ContentResearchStoredOperation; }
export function toContentResearchResult(value: ContentResearchStoredOperation): ContentResearchResult {
  const safe = { operationId: value.operationId, status: value.status, sources: value.status === 'completed' ? value.sources.map(({extractedText: _private, ...source}) => source) : [], usage: value.usage, safeCode: value.safeCode };
  return parseContentResearchResult(safe);
}
