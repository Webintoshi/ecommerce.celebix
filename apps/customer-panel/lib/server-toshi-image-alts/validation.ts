import { createHash } from 'node:crypto';
import { ToshiImageAltError } from './errors.ts';
export type ToshiImageAltRequest = Readonly<{ draftId: string; productId: string | null; context: Readonly<{ title: string; description?: string }>; images: readonly Readonly<{ id: string; dataUrl: string; variantLabel?: string }>[] }>;
export type ToshiImageAltResult = Readonly<{ results: readonly Readonly<{ id: string; altText: string }>[]; failedIds: readonly string[]; chargedCredits: number }>;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function invalid(): never { throw new ToshiImageAltError('invalid_input'); }
export function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key) || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) invalid();
  return Object.fromEntries(keys.map(key => [key, descriptors[key as string]!.value]));
}
function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) || (!allowEmpty && (!value.trim() || value !== value.trim()))) invalid();
  return value;
}
function dimensions(width: number, height: number): void { if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16_777_216) invalid(); }
function image(value: unknown): string {
  const encoded = text(value, 174_800), match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(encoded);
  if (!match || match[2]!.length % 4 !== 0) invalid();
  const bytes = Buffer.from(match[2]!, 'base64');
  try {
    if (bytes.length > 131_072 || bytes.length < 20 || bytes.toString('base64') !== match[2]) invalid();
    if (match[1] === 'png') {
      if (bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND' || bytes.readUInt32BE(bytes.length - 12) !== 0) invalid();
      dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    } else if (match[1] === 'webp') {
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) + 8 !== bytes.length || bytes.toString('ascii', 8, 12) !== 'WEBP' || !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16)) || bytes.readUInt32LE(16) + 20 > bytes.length) invalid();
      const kind = bytes.toString('ascii', 12, 16);
      if (kind === 'VP8X') { if (bytes.length < 30) invalid(); dimensions(1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)); }
      if (kind === 'VP8L') { if (bytes.length < 25 || bytes[20] !== 0x2f) invalid(); const bits = bytes.readUInt32LE(21); dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); }
      if (kind === 'VP8 ') { if (bytes.length < 30 || bytes.subarray(23, 26).toString('hex') !== '9d012a') invalid(); dimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff); }
    } else {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) invalid();
      let offset = 2, found = false;
      while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 0xff) invalid();
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++]; if (marker === 0xda || marker === 0xd9) break;
        if (marker === undefined || marker === 0 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) invalid();
        const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) invalid();
        if ([0xc0, 0xc1, 0xc2].includes(marker)) { if (length < 8) invalid(); dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)); found = true; }
        offset += length;
      }
      if (!found) invalid();
    }
    return encoded;
  } finally { bytes.fill(0); }
}
export function parseToshiImageAltRequest(value: unknown): ToshiImageAltRequest {
  const raw = exact(value, ['draftId', 'productId', 'context', 'images']), context = exact(raw.context, ['title'], ['description']);
  if (typeof raw.draftId !== 'string' || !UUID.test(raw.draftId) || raw.productId !== null && (typeof raw.productId !== 'string' || !UUID.test(raw.productId)) || !Array.isArray(raw.images) || raw.images.length < 1 || raw.images.length > 4 || Object.getPrototypeOf(raw.images) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(raw.images);
  if (Reflect.ownKeys(descriptors).length !== raw.images.length + 1) invalid();
  for (let i = 0; i < raw.images.length; i++) if (!descriptors[String(i)]?.enumerable || !('value' in descriptors[String(i)]!)) invalid();
  const seen = new Set<string>();
  const images = raw.images.map(value => { const entry = exact(value, ['id', 'dataUrl'], ['variantLabel']); const id = text(entry.id, 100); if (seen.has(id)) invalid(); seen.add(id); return Object.freeze({ id, dataUrl: image(entry.dataUrl), ...(entry.variantLabel === undefined ? {} : { variantLabel: text(entry.variantLabel, 200, true) }) }); });
  return Object.freeze({ draftId: raw.draftId as string, productId: raw.productId as string | null, context: Object.freeze({ title: text(context.title, 400, true), ...(context.description === undefined ? {} : { description: text(context.description, 16_000, true) }) }), images: Object.freeze(images) });
}
export function imageAltFingerprint(storeId: string, request: ToshiImageAltRequest): string { return createHash('sha256').update(JSON.stringify({ kind: 'toshi_image_alt_v1', storeId, request })).digest('hex'); }
export function parseToshiImageAltOutput(value: unknown, ids: readonly string[]): ToshiImageAltResult {
  try {
    const raw = exact(value, ['results']);
    if (!Array.isArray(raw.results) || raw.results.length > ids.length) invalid();
    const seen = new Set<string>(), results: { id: string; altText: string }[] = [];
    for (const entry of raw.results) {
      const selected = exact(entry, ['id', 'altText']);
      if (typeof selected.id !== 'string' || !ids.includes(selected.id) || seen.has(selected.id)) invalid();
      seen.add(selected.id);
      if (selected.altText === null) continue;
      const altText = text(selected.altText, 200);
      if (/[<>\r\n\t]/u.test(altText)) invalid();
      results.push(Object.freeze({ id: selected.id, altText }));
    }
    const ordered = ids.flatMap(id => results.filter(result => result.id === id));
    return Object.freeze({ results: Object.freeze(ordered), failedIds: Object.freeze(ids.filter(id => !results.some(result => result.id === id))), chargedCredits: results.length });
  } catch { throw new ToshiImageAltError('invalid_output'); }
}
export function parseToshiImageAltReplay(value: unknown, ids: readonly string[]): ToshiImageAltResult {
  try {
    const envelope = value && typeof value === 'object' && Object.hasOwn(value, 'schemaVersion') ? exact(value, ['schemaVersion', 'provider', 'model', 'result', 'usage']) : null;
    if (envelope) {
      if (envelope.schemaVersion !== 1 || envelope.provider !== 'deepseek' || envelope.model !== 'deepseek-flash') invalid();
      if (envelope.usage !== null) {
        const usage = exact(envelope.usage, ['promptTokens', 'completionTokens', 'totalTokens', 'promptCacheHitTokens', 'promptCacheMissTokens']);
        if (Object.values(usage).some(value => value !== null && (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000))) invalid();
      }
    }
    const raw = exact(envelope ? envelope.result : value, ['results', 'failedIds', 'chargedCredits']);
    const result = parseToshiImageAltOutput({ results: raw.results }, ids);
    if (raw.chargedCredits !== result.chargedCredits || JSON.stringify(raw.failedIds) !== JSON.stringify(result.failedIds) || result.results.length < 1) invalid();
    return result;
  } catch { throw new ToshiImageAltError('unavailable'); }
}
export type ToshiImageAltUsage = Readonly<{ promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; promptCacheHitTokens: number | null; promptCacheMissTokens: number | null }>;
export function parseToshiImageAltUsage(value: unknown): ToshiImageAltUsage | null {
  try {
  if (value === undefined || value === null) return null;
  const raw = exact(value, [], ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'prompt_tokens_details', 'completion_tokens_details']);
  const count = (key: string): number | null => { const value = raw[key]; if (value === undefined) return null; if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000) throw new ToshiImageAltError('provider_unavailable'); return value as number; };
  let promptCacheHitTokens = count('prompt_cache_hit_tokens');
  if (promptCacheHitTokens === null && raw.prompt_tokens_details !== undefined) {
    const details = raw.prompt_tokens_details;
    if (!details || typeof details !== 'object' || Array.isArray(details)) invalid();
    const cached = (details as Record<string, unknown>).cached_tokens;
    if (cached !== undefined) { if (!Number.isSafeInteger(cached) || (cached as number) < 0 || (cached as number) > 10_000_000) invalid(); promptCacheHitTokens = cached as number; }
  }
  return Object.freeze({ promptTokens: count('prompt_tokens'), completionTokens: count('completion_tokens'), totalTokens: count('total_tokens'), promptCacheHitTokens, promptCacheMissTokens: count('prompt_cache_miss_tokens') });
  } catch { throw new ToshiImageAltError('provider_unavailable'); }
}
