import { parseSaveMerchantContentRequest } from '../merchant-content/validation.ts';
import type { MerchantContentField, MerchantContentValues } from '../merchant-content/types.ts';
import type { ContentResourceTarget, ContentOutline, ContentResourceAuthoringRequest, ContentResourceDraft, ContentResourceUsage, ContentResourceGeneration, ContentResourceGenerationView } from './types.ts';
const encoder = new TextEncoder(), FIELDS = ['name', 'body', 'excerpt', 'seoTitle', 'seoDescription'] as const;
const ID = '11111111-1111-4111-8111-111111111111';
const EMPTY: MerchantContentValues = { name: 'Content', slug: 'content', locale: 'tr', body: '', excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' };
const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function invalid(): never { throw new TypeError('content_resource_contract_invalid'); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const ds = Object.getOwnPropertyDescriptors(value), out: Record<string, unknown> = {}, allowed = new Set([...required, ...optional]);
    for (const key of Reflect.ownKeys(ds)) {
        if (typeof key !== 'string' || !allowed.has(key) || !ds[key]!.enumerable || !('value' in ds[key]!))
            invalid();
        out[key] = ds[key]!.value;
    }
    if (required.some(k => !Object.hasOwn(out, k)))
        invalid();
    return out;
}
function array(value: unknown, max: number, min = 0): readonly unknown[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
        invalid();
    const ds = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap, len = ds.length?.value;
    if (!Number.isSafeInteger(len) || len < min || len > max || Reflect.ownKeys(ds).length !== len + 1)
        invalid();
    const out: unknown[] = [];
    for (let i = 0; i < len; i++) {
        const d = ds[String(i)];
        if (!d?.enumerable || !('value' in d))
            invalid();
        out.push(d.value);
    }
    return out;
}
function text(value: unknown, max: number, min = 0) { if (typeof value !== 'string' || BAD.test(value) || encoder.encode(value).length > max || encoder.encode(value).length < min)
    invalid(); return value; }
function uuid(value: unknown) { const s = text(value, 36, 36); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s))
    invalid(); return s; }
function digest(value: unknown) { const s = text(value, 64, 64); if (!/^[a-f0-9]{64}$/.test(s))
    invalid(); return s; }
function integer(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalid(); return value as number; }
function choice<T extends string>(v: unknown, allowed: readonly T[]): T { if (typeof v !== 'string' || !allowed.includes(v as T))
    invalid(); return v as T; }
function stamp(value: unknown) { const s = text(value, 24, 24), d = new Date(s); if (!Number.isFinite(d.getTime()) || d.toISOString() !== s)
    invalid(); return s; }
function parsedValues(value: unknown, mode: 'replace' | 'preserve'): MerchantContentValues { return parseSaveMerchantContentRequest({ draftId: ID, recordId: mode === 'preserve' ? ID : null, expectedVersion: mode === 'preserve' ? 1 : null, expectedBodyDigest: mode === 'preserve' ? 'sha256:' + 'a'.repeat(64) : null, kind: 'page', bodyAction: mode, values: value, origins: {} }).values; }
export function parseContentResourceTarget(value: unknown): ContentResourceTarget { const r = object(value, ['kind', 'draftId', 'recordId', 'recordVersion']); const recordId = r.recordId === null ? null : uuid(r.recordId), recordVersion = r.recordVersion === null ? null : integer(r.recordVersion); if ((recordId === null) !== (recordVersion === null))
    invalid(); return Object.freeze({ kind: choice(r.kind, ['page', 'blog_post']), draftId: uuid(r.draftId), recordId, recordVersion }); }
export function parseContentOutline(value: unknown): ContentOutline {
    const r = object(value, ['title', 'sections']);
    const out = Object.freeze({ title: text(r.title, 160, 1), sections: Object.freeze(array(r.sections, 12, 1).map(v => { const s = object(v, ['heading', 'points']); return Object.freeze({ heading: text(s.heading, 200, 1), points: Object.freeze(array(s.points, 6).map(p => text(p, 500, 1))) }); })) });
    if (encoder.encode(JSON.stringify(out)).length > 8192)
        invalid();
    return out;
}
export function parseContentResourceAuthoringRequest(value: unknown): ContentResourceAuthoringRequest {
    // Read the discriminator as a data descriptor before selecting the exact key set.
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const d = Object.getOwnPropertyDescriptor(value, 'stage');
    if (!d || !('value' in d))
        invalid();
    const stage = choice(d.value, ['outline', 'draft']);
    const r = object(value, ['target', 'currentDraft', 'locale', 'tone', 'length', 'note', 'researchOperationId', 'stage', ...(stage === 'outline' ? ['topic', 'purpose'] : ['action', 'fields', 'reviewedOutline', 'outlineGenerationId', 'selection'])], ['brandVoice']);
    const locale = text(r.locale, 35, 2);
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale))
        invalid();
    const base = { target: parseContentResourceTarget(r.target), currentDraft: parsedValues(r.currentDraft, 'preserve'), locale, tone: choice(r.tone, ['neutral', 'friendly', 'professional']), length: choice(r.length, ['short', 'medium', 'long']), note: text(r.note, 2000), researchOperationId: r.researchOperationId === null ? null : uuid(r.researchOperationId), ...(Object.hasOwn(r, 'brandVoice') ? { brandVoice: r.brandVoice === null ? null : voice(r.brandVoice) } : {}) };
    if (stage === 'outline')
        return Object.freeze({ ...base, stage, topic: text(r.topic, 500, 1), purpose: text(r.purpose, 1000, 1) });
    const action = choice(r.action, ['article', 'improve', 'shorten', 'rewrite_selection', 'seo']), fields = Object.freeze(array(r.fields, 5, 1).map(f => choice(f, FIELDS)));
    if (new Set(fields).size !== fields.length)
        invalid();
    const reviewedOutline = r.reviewedOutline === null ? null : parseContentOutline(r.reviewedOutline), outlineGenerationId = r.outlineGenerationId === null ? null : uuid(r.outlineGenerationId);
    if (action === 'article' ? (reviewedOutline === null || outlineGenerationId === null) : (reviewedOutline !== null || outlineGenerationId !== null))
        invalid();
    let selection: null | Readonly<{
        field: 'body';
        text: string;
    }> = null;
    if (r.selection !== null) {
        const s = object(r.selection, ['field', 'text']);
        selection = Object.freeze({ field: choice(s.field, ['body']), text: text(s.text, 80000, 1) });
    }
    if (action === 'rewrite_selection' ? (selection === null || fields.length !== 1 || fields[0] !== 'body' || !base.currentDraft.body.includes(selection.text)) : selection !== null)
        invalid();
    if (action === 'seo' && fields.some(f => !['seoTitle', 'seoDescription'].includes(f)))
        invalid();
    return Object.freeze({ ...base, stage, action, fields, reviewedOutline, outlineGenerationId, selection });
}
function voice(value: unknown) { const s = text(value, 640); if (s.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(s))
    invalid(); return s; }
export function parseContentResourceDraft(value: unknown): ContentResourceDraft {
    const r = object(value, ['sourceFingerprint', 'values', 'citations', 'suggestions']), v = object(r.values, [], FIELDS), fields = Object.keys(v) as MerchantContentField[];
    if (!fields.length)
        invalid();
    const parsed = parsedValues({ ...EMPTY, ...v }, 'replace');
    const values = Object.freeze(Object.fromEntries(fields.map(k => [k, parsed[k]])));
    const citations = Object.freeze(array(r.citations, 100).map(c => { const x = object(c, ['field', 'sourceId', 'quote']), field = choice(x.field, FIELDS); if (!fields.includes(field))
        invalid(); return Object.freeze({ field, sourceId: uuid(x.sourceId), quote: text(x.quote, 512, 1) }); }));
    const suggestions = Object.freeze(array(r.suggestions, 12).map(s => text(s, 500, 1)));
    return Object.freeze({ sourceFingerprint: digest(r.sourceFingerprint), values, citations, suggestions });
}
export function parseContentResourceUsage(value: unknown): ContentResourceUsage | null {
    if (value === null)
        return null;
    const r = object(value, ['inputTokens', 'outputTokens', 'totalTokens']);
    for (const v of Object.values(r))
        if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 2147483647)
            invalid();
    if ((r.inputTokens as number) + (r.outputTokens as number) !== r.totalTokens)
        invalid();
    return Object.freeze(r) as unknown as ContentResourceUsage;
}
const VIEW = ['id', 'target', 'stage', 'status', 'outline', 'draft', 'sourceFingerprint', 'usage', 'safeCode', 'createdAt', 'updatedAt', 'finishedAt'];
function view(r: Record<string, unknown>): ContentResourceGenerationView {
    const stage = choice(r.stage, ['outline', 'draft']), status = choice(r.status, ['pending', 'completed', 'failed', 'unknown']), sourceFingerprint = digest(r.sourceFingerprint), outline = r.outline === null ? null : parseContentOutline(r.outline), draft = r.draft === null ? null : parseContentResourceDraft(r.draft), safeCode = r.safeCode === null ? null : text(r.safeCode, 64, 1), finishedAt = r.finishedAt === null ? null : stamp(r.finishedAt);
    if (status === 'completed' ? (stage === 'outline' ? outline === null || draft !== null : draft === null || outline !== null) : outline !== null || draft !== null)
        invalid();
    if (draft && draft.sourceFingerprint !== sourceFingerprint)
        invalid();
    if ((status === 'pending') !== (finishedAt === null) || ((status === 'pending' || status === 'completed') && safeCode !== null))
        invalid();
    return Object.freeze({ id: uuid(r.id), target: parseContentResourceTarget(r.target), stage, status, outline, draft, sourceFingerprint, usage: parseContentResourceUsage(r.usage), safeCode, createdAt: stamp(r.createdAt), updatedAt: stamp(r.updatedAt), finishedAt });
}
export function parseContentResourceGenerationView(value: unknown): ContentResourceGenerationView { return view(object(value, VIEW)); }
export function parseContentResourceGeneration(value: unknown): ContentResourceGeneration {
    const r = object(value, [...VIEW, 'requestFingerprint', 'configId', 'provider', 'model', 'credentialVersion', 'promptVersion', 'version', 'dispatchState', 'claimToken', 'leaseExpiresAt']);
    const parsed = view(r), dispatchState = choice(r.dispatchState, ['not_dispatched', 'dispatched', 'unknown']), claimToken = r.claimToken === null ? null : uuid(r.claimToken), leaseExpiresAt = r.leaseExpiresAt === null ? null : stamp(r.leaseExpiresAt);
    if ((dispatchState === 'not_dispatched' && claimToken !== null) || (dispatchState === 'dispatched' && claimToken === null) || (parsed.status === 'pending' && leaseExpiresAt === null))
        invalid();
    return Object.freeze({ ...parsed, requestFingerprint: digest(r.requestFingerprint), configId: uuid(r.configId), provider: choice(r.provider, ['deepseek', 'openai', 'gemini', 'anthropic']), model: text(r.model, 128, 1), credentialVersion: integer(r.credentialVersion), promptVersion: text(r.promptVersion, 128, 1), version: integer(r.version), dispatchState, claimToken, leaseExpiresAt });
}
