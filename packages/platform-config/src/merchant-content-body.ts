import MarkdownIt from 'markdown-it';
import { normalizeProductDescriptionHtml } from './product-description-rich-text.ts';
const decoder = new MarkdownIt();
const encoder = new TextEncoder();
const TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const INLINE = new Set(['br', 'strong', 'em', 'u', 'del', 'a', 'code']);
const ALIASES: Readonly<Record<string, string>> = { b: 'strong', i: 'em', s: 'del' };
const BAD_UNICODE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
function invalid(): never { throw new TypeError('merchant_content_body_invalid'); }
function validText(source: unknown): asserts source is string { if (typeof source !== 'string' || BAD_UNICODE.test(source) || CONTROL.test(source))
    invalid(); }
function escape(source: string): string { return source.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
function decode(source: string): string {
    const decoded = source.replace(/&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g, entity => {
        if (entity.startsWith('&#')) {
            const hex = /^&#[xX]/.test(entity), point = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
            if (!Number.isSafeInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) || CONTROL.test(String.fromCodePoint(point)))
                invalid();
        }
        return decoder.utils.unescapeAll(entity);
    });
    validText(decoded);
    return decoded;
}
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
function attributes(source: string): Record<string, string> {
    const out: Record<string, string> = {};
    const pattern = /\s+([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giy;
    let cursor = 0;
    while (cursor < source.length) {
        if (/^\s*$/.test(source.slice(cursor)))
            break;
        pattern.lastIndex = cursor;
        const m = pattern.exec(source);
        if (!m)
            invalid();
        const key = m[1]!.toLowerCase();
        if (!['href', 'target', 'rel'].includes(key) || Object.hasOwn(out, key))
            invalid();
        out[key] = decode(m[2] ?? m[3] ?? m[4] ?? '');
        cursor = pattern.lastIndex;
    }
    return out;
}
/** New writes use a balanced safe subset, without browser repair or silent sanitization. */
export function normalizeMerchantContentBody(source: string): string {
    validText(source);
    if (source === '')
        return '';
    // The public wire envelope is bounded too; normalization still measures the final HTML.
    if (encoder.encode(source).length > 786432)
        invalid();
    if (!/<\/?[a-z][^>]*>/i.test(source)) {
        if (/<!|<\?/.test(source))
            invalid();
        const html = '<p>' + escape(source).replace(/\r\n?|\n/g, '<br />') + '</p>';
        if (encoder.encode(html).length > 80000)
            invalid();
        return html;
    }
    const token = /<[^>]*>|[^<]+|</gy, stack: string[] = [];
    let cursor = 0, out = '';
    while (cursor < source.length) {
        token.lastIndex = cursor;
        const m = token.exec(source);
        if (!m)
            invalid();
        cursor = token.lastIndex;
        const part = m[0], parent = stack.at(-1);
        if (!part.startsWith('<') || part === '<') {
            const text = decode(part);
            if (parent && ['ul', 'ol', 'table', 'thead', 'tbody', 'tr'].includes(parent) && !/^\s*$/.test(text))
                invalid();
            out += escape(text);
            continue;
        }
        const close = part.match(/^<\/([a-z0-9]+)\s*>$/i);
        if (close) {
            const raw = close[1]!.toLowerCase(), tag = Object.hasOwn(ALIASES, raw) ? ALIASES[raw]! : raw;
            if (stack.pop() !== tag)
                invalid();
            out += '</' + tag + '>';
            continue;
        }
        const open = part.match(/^<([a-z0-9]+)([^>]*)>$/i);
        if (!open)
            invalid();
        const raw = open[1]!.toLowerCase(), tag = Object.hasOwn(ALIASES, raw) ? ALIASES[raw]! : raw, attrSource = open[2]!;
        if (!TAGS.has(tag))
            invalid();
        let attr = '';
        if (tag === 'br' || tag === 'hr') {
            if (!/^\s*\/?\s*$/.test(attrSource))
                invalid();
        }
        else if (tag === 'a') {
            const a = attributes(attrSource);
            if (a.target !== undefined && a.target !== '_blank')
                invalid();
            if (a.rel !== undefined && a.rel.split(/\s+/).some(r => !['noopener', 'noreferrer', 'nofollow'].includes(r)))
                invalid();
            if (a.href !== undefined) {
                if (!safeHref(a.href))
                    invalid();
                attr = ' href="' + escape(a.href) + '"' + (/^https?:\/\//i.test(a.href) ? ' target="_blank" rel="noopener noreferrer nofollow"' : '');
            }
            else if (a.target !== undefined || a.rel !== undefined)
                invalid();
        }
        else if (!/^\s*$/.test(attrSource))
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
        out += '<' + tag + attr + (tag === 'br' || tag === 'hr' ? ' />' : '>');
        if (tag !== 'br' && tag !== 'hr') {
            stack.push(tag);
            if (stack.length > 64)
                invalid();
        }
    }
    if (stack.length || encoder.encode(out).length > 80000)
        invalid();
    return out;
}
/** Counts final normalized HTML, including escaped text and canonical link attributes. */
export function merchantContentBodyBytes(source: string): number { return encoder.encode(normalizeMerchantContentBody(source)).length; }
/** A read never rewrites stored source; legacy rendering keeps its existing behavior. */
export function renderMerchantContentBody(source: string, format: 'legacy' | 'normalized_html'): string {
    validText(source);
    if (encoder.encode(source).length > 80000)
        invalid();
    if (format === 'legacy')
        return normalizeProductDescriptionHtml(source);
    if (format !== 'normalized_html' || normalizeMerchantContentBody(source) !== source)
        invalid();
    return source;
}
