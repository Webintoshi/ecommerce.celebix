import type { MerchantContentDocument, MerchantContentKind, MerchantContentOrigins, MerchantContentValues, SaveMerchantContentRequest } from './types.ts';
const encoder = new TextEncoder();
const BAD_UNICODE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const VALUE_KEYS = ['name', 'slug', 'locale', 'body', 'excerpt', 'seoTitle', 'seoDescription', 'published', 'status'] as const;
const FIELDS = ['name', 'body', 'excerpt', 'seoTitle', 'seoDescription'] as const;
const TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const INLINE = new Set(['br', 'strong', 'em', 'u', 'del', 'a', 'code']);
function invalid(): never { throw new TypeError('merchant_content_contract_invalid'); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors), allowed = new Set([...required, ...optional]);
    if (keys.some(key => typeof key !== 'string' || !allowed.has(key)))
        invalid();
    const out: Record<string, unknown> = {};
    for (const key of keys as string[]) {
        const d = descriptors[key]!;
        if (!d.enumerable || !('value' in d))
            invalid();
        out[key] = d.value;
    }
    if (required.some(key => !Object.hasOwn(out, key)))
        invalid();
    return out;
}
function text(value: unknown, max: number, min = 0): string {
    if (typeof value !== 'string' || BAD_UNICODE.test(value) || CONTROL.test(value))
        invalid();
    const size = encoder.encode(value).length;
    if (size < min || size > max)
        invalid();
    return value;
}
function uuid(value: unknown): string { const s = text(value, 36, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))
    invalid(); return s; }
function digest(value: unknown): string { const s = text(value, 71, 71); if (!/^sha256:[a-f0-9]{64}$/.test(s))
    invalid(); return s; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalid(); return value as number; }
function choice<T extends string>(value: unknown, choices: readonly T[]): T { if (typeof value !== 'string' || !choices.includes(value as T))
    invalid(); return value as T; }
function timestamp(value: unknown): string { const s = text(value, 24, 24), d = new Date(s); if (!Number.isFinite(d.getTime()) || d.toISOString() !== s)
    invalid(); return s; }
function canonicalText(value: string): boolean { return !/[<>&"']/.test(value.replace(/&(?:amp|lt|gt|quot|#39);/g, '')); }
function decode(value: string): string { return value.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!); }
function safeHref(value: string): boolean {
    if (!value || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value))
        return false;
    if (value.startsWith('/'))
        return !value.startsWith('//');
    if (value.startsWith('#'))
        return value.length > 1;
    if (/^mailto:[^@\s]+@[^@\s]+$/i.test(value) || /^tel:\+?[\d().-]+(?:;ext=\d+)?$/i.test(value))
        return true;
    const http = value.match(/^https?:\/\/([^/?#]+)([/?#][\s\S]*)?$/i);
    if (!http)
        return false;
    const authority = http[1]!.match(/^([^:]+)(?::([0-9]{1,5}))?$/);
    if (!authority)
        return false;
    const host = authority[1]!;
    return host.length <= 253 && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(host)
        && (authority[2] === undefined || Number(authority[2]) <= 65535);
}
/** Exact serialized grammar mirrored by the normalizer and the storage RPC, without DOM repair. */
function normalizedBody(value: unknown): string {
    const source = text(value, 80000);
    if (source === '')
        return source;
    const stack: string[] = [];
    const token = /<[^>]*>|[^<]+/gy;
    let cursor = 0, tags = 0;
    while (cursor < source.length) {
        token.lastIndex = cursor;
        const m = token.exec(source);
        if (!m)
            invalid();
        const part = m[0];
        cursor = token.lastIndex;
        const parent = stack.at(-1);
        if (!part.startsWith('<')) {
            if (!canonicalText(part) || (parent && ['ul', 'ol', 'table', 'thead', 'tbody', 'tr'].includes(parent) && !/^\s*$/.test(part)))
                invalid();
            continue;
        }
        const close = part.match(/^<\/([a-z0-9]+)>$/);
        if (close) {
            if (stack.pop() !== close[1])
                invalid();
            continue;
        }
        const open = part.match(/^<([a-z0-9]+)([^>]*)>$/);
        if (!open || !TAGS.has(open[1]!))
            invalid();
        const tag = open[1]!, attrs = open[2]!;
        if (tag === 'br' || tag === 'hr') {
            if (attrs !== ' /')
                invalid();
        }
        else if (tag === 'a' && attrs !== '') {
            const a = attrs.match(/^ href="([^"]+)"( target="_blank" rel="noopener noreferrer nofollow")?$/);
            if (!a || !canonicalText(a[1]!))
                invalid();
            const href = decode(a[1]!);
            if (!safeHref(href) || /^https?:\/\//i.test(href) !== !!a[2])
                invalid();
        }
        else if (attrs !== '')
            invalid();
        if (parent && ['p', 'h2', 'h3', 'h4', 'pre', 'strong', 'em', 'u', 'del', 'a', 'code'].includes(parent) && !INLINE.has(tag))
            invalid();
        if (parent && ['ul', 'ol'].includes(parent) && tag !== 'li')
            invalid();
        if (parent === 'table' && !['thead', 'tbody', 'tr'].includes(tag))
            invalid();
        if (parent && ['thead', 'tbody'].includes(parent) && tag !== 'tr')
            invalid();
        if (parent === 'tr' && !['th', 'td'].includes(tag))
            invalid();
        if (tag === 'li' && !['ul', 'ol'].includes(parent ?? ''))
            invalid();
        if (['thead', 'tbody'].includes(tag) && parent !== 'table')
            invalid();
        if (tag === 'tr' && !['table', 'thead', 'tbody'].includes(parent ?? ''))
            invalid();
        if (['th', 'td'].includes(tag) && parent !== 'tr')
            invalid();
        if (tag === 'a' && stack.includes('a'))
            invalid();
        tags++;
        if (tag !== 'br' && tag !== 'hr') {
            stack.push(tag);
            if (stack.length > 64)
                invalid();
        }
    }
    if (stack.length || !tags)
        invalid();
    return source;
}
function plain(value: unknown, max: number, min = 0): string { const s = text(value, max, min); if (/<\/?[a-z!][\s\S]*>/i.test(s) || (min > 0 && !s.trim()))
    invalid(); return s; }
type ContentSnapshot = Omit<MerchantContentValues, 'status'> & {
    status: MerchantContentDocument['status'];
};
function values(value: unknown, mode: 'replace' | 'preserve'): MerchantContentValues;
function values(value: unknown, mode: 'replace' | 'preserve', archived: true): ContentSnapshot;
function values(value: unknown, mode: 'replace' | 'preserve', archived = false): ContentSnapshot {
    const r = record(value, VALUE_KEYS), name = plain(r.name, 160, 1), slug = text(r.slug, 100, 1), locale = text(r.locale, 35, 2);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale) || typeof r.published !== 'boolean')
        invalid();
    const status = choice(r.status, archived ? ['draft', 'active', 'archived'] : ['draft', 'active']);
    if (!archived && r.published && status !== 'active')
        invalid();
    return Object.freeze({ name, slug, locale, body: mode === 'replace' ? normalizedBody(r.body) : text(r.body, 80000), excerpt: r.excerpt === null ? null : plain(r.excerpt, 4000), seoTitle: r.seoTitle === null ? null : plain(r.seoTitle, 160), seoDescription: r.seoDescription === null ? null : plain(r.seoDescription, 4000), published: r.published, status });
}
export function parseMerchantContentOrigins(value: unknown): MerchantContentOrigins {
    const r = record(value, [], FIELDS);
    const out: Record<string, unknown> = {};
    for (const field of Object.keys(r)) {
        const origin = record(r[field], ['state'], ['generationId']), state = choice(origin.state, ['manual', 'ai', 'edited_ai']);
        if (state === 'manual') {
            if (Object.hasOwn(origin, 'generationId'))
                invalid();
            out[field] = Object.freeze({ state });
        }
        else {
            if (!Object.hasOwn(origin, 'generationId'))
                invalid();
            out[field] = Object.freeze({ state, generationId: uuid(origin.generationId) });
        }
    }
    return Object.freeze(out) as MerchantContentOrigins;
}
export function parseSaveMerchantContentRequest(value: unknown): SaveMerchantContentRequest {
    const r = record(value, ['draftId', 'recordId', 'expectedVersion', 'expectedBodyDigest', 'kind', 'bodyAction', 'values', 'origins']), bodyAction = choice(r.bodyAction, ['replace', 'preserve']);
    const recordId = r.recordId === null ? null : uuid(r.recordId), expectedVersion = r.expectedVersion === null ? null : integer(r.expectedVersion), expectedBodyDigest = r.expectedBodyDigest === null ? null : digest(r.expectedBodyDigest);
    if ((recordId === null) !== (expectedVersion === null) || (recordId === null) !== (expectedBodyDigest === null) || (recordId === null && bodyAction !== 'replace'))
        invalid();
    const parsed = Object.freeze({ draftId: uuid(r.draftId), recordId, expectedVersion, expectedBodyDigest, kind: choice(r.kind, ['blog_post', 'page'] satisfies readonly MerchantContentKind[]), bodyAction, values: values(r.values, bodyAction), origins: parseMerchantContentOrigins(r.origins) });
    if (encoder.encode(JSON.stringify(parsed)).length > 262144)
        invalid();
    return parsed;
}
export function parseMerchantContentDocument(value: unknown): MerchantContentDocument {
    const keys = ['id', 'kind', 'version', 'publishedAt', 'createdAt', 'updatedAt', 'bodyFormat', 'bodyDigest', 'origins'];
    const r = record(value, [...VALUE_KEYS, ...keys]), bodyFormat = choice(r.bodyFormat, ['legacy', 'normalized_html']);
    const snapshot = Object.fromEntries(VALUE_KEYS.map(k => [k, r[k]]));
    return Object.freeze({ ...values(snapshot, bodyFormat === 'legacy' ? 'preserve' : 'replace', true), id: uuid(r.id), kind: choice(r.kind, ['blog_post', 'page']), status: choice(r.status, ['draft', 'active', 'archived']), version: integer(r.version), publishedAt: r.publishedAt === null ? null : timestamp(r.publishedAt), createdAt: timestamp(r.createdAt), updatedAt: timestamp(r.updatedAt), bodyFormat, bodyDigest: digest(r.bodyDigest), origins: parseMerchantContentOrigins(r.origins) });
}
