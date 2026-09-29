import { merchantContentBodyBytes, normalizeMerchantContentBody, renderMerchantContentBody } from '../../../packages/platform-config/src/merchant-content-body.ts';
import MarkdownIt, {type Options as MarkdownItOptions} from 'markdown-it';

export type MerchantContentBodyFormat = 'legacy' | 'normalized_html';
export type MerchantContentBodyChange = Readonly<{value: string; bodyFormat: MerchantContentBodyFormat}>;
type HtmlParser = (source: string) => Document;

const browserParser: HtmlParser = (source) => new DOMParser().parseFromString(source, 'text/html');
const generatedColumnStyle = 'min-width: 25px;';
const generatedMarkupTags = new Set(['p', 'br', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col']);
const voidMarkupTags = new Set(['br', 'hr', 'col']);
const markdownOptions: MarkdownItOptions & Readonly<{maxNesting: number}> = {html: false, linkify: false, typographer: false, breaks: false, maxNesting: 20};
const markdown = new MarkdownIt(markdownOptions);

function invalid(): never { throw new TypeError('merchant_content_editor_markup_invalid'); }

/** TipTap adds layout metadata to otherwise plain tables. Remove only verified defaults. */
function stripGeneratedTableLayout(document: Document) {
  for (const table of Array.from(document.body.querySelectorAll('table'))) {
    const children = Array.from(table.children);
    const groups = children.filter((child) => child.tagName.toLowerCase() === 'colgroup');
    const style = table.getAttribute('style');
    if (table.attributes.length > (style === null ? 0 : 1)) invalid();
    if (groups.length > 1 || Boolean(style) !== Boolean(groups.length)) invalid();
    if (groups.length === 1) {
      const group = groups[0]!;
      if (group.attributes.length) invalid();
      const columns = Array.from(group.children);
      if (columns.length === 0 || columns.some((column) => column.tagName.toLowerCase() !== 'col' || column.attributes.length !== 1 || column.getAttribute('style') !== generatedColumnStyle)) invalid();
      if (style !== `min-width: ${columns.length * 25}px;`) invalid();
      group.remove();
      table.removeAttribute('style');
    }
    for (const cell of Array.from(table.querySelectorAll('th,td'))) {
      for (const attribute of Array.from(cell.attributes)) {
        if ((attribute.name === 'colspan' || attribute.name === 'rowspan') && attribute.value === '1') cell.removeAttribute(attribute.name);
        else invalid();
      }
    }
  }
}

/** Serializes real TipTap output without accepting arbitrary HTML attributes or span changes. */
export function normalizeMerchantContentEditorHtml(source: string, parse: HtmlParser = browserParser): string {
  if (typeof source !== 'string' || source.length > 786_432) invalid();
  // Inspect raw TipTap markup before DOMParser can relocate or discard a node.
  const tokens = /<[^>]*>|[^<]+|</gy;
  const stack: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    tokens.lastIndex = cursor;
    const match = tokens.exec(source);
    if (!match) invalid();
    cursor = tokens.lastIndex;
    if (!match[0].startsWith('<')) continue;
    const closing = match[0].match(/^<\/([a-z][a-z0-9]*)\s*>$/i);
    if (closing) {
      if (stack.pop() !== closing[1]!.toLowerCase()) invalid();
      continue;
    }
    const opening = match[0].match(/^<([a-z][a-z0-9]*)(?:\s[^>]*)?>$/i);
    if (!opening || !generatedMarkupTags.has(opening[1]!.toLowerCase())) invalid();
    const tag = opening[1]!.toLowerCase();
    if (!voidMarkupTags.has(tag)) {
      if (/\/\s*>$/.test(match[0])) invalid();
      stack.push(tag);
      if (stack.length > 64) invalid();
    }
  }
  if (stack.length) invalid();
  const document = parse(source);
  stripGeneratedTableLayout(document);
  const html = document.body.innerHTML;
  return html === '<p></p>' ? '' : normalizeMerchantContentBody(html);
}

function hasLossyLegacyMarkdownMetadata(source: string): boolean {
  const pending = [...markdown.parse(source, {})];
  while (pending.length) {
    const token = pending.pop()!;
    if (token.type === 'image' || (token.type === 'link_open' && token.attrGet('title') !== null)) return true;
    if (token.children) pending.push(...token.children);
  }
  return false;
}

export function merchantContentEditorHtml(source: string, bodyFormat: MerchantContentBodyFormat): string {
  return renderMerchantContentBody(source, bodyFormat);
}

function semanticChildren(node: Node): unknown[] {
  const out: unknown[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? '';
      if (!text || ((node as Element).tagName?.toLowerCase() === 'body' && /^\s*$/.test(text))) continue;
      out.push(['text', text]);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === 'colgroup') invalid();
    if (tag === 'thead' || tag === 'tbody') { out.push(...semanticChildren(element)); continue; }
    if (tag === 'p' && ['li', 'th', 'td'].includes((node as Element).tagName?.toLowerCase() ?? '')) { out.push(...semanticChildren(element)); continue; }
    if (tag === 'code' && (node as Element).tagName?.toLowerCase() === 'pre') { out.push(...semanticChildren(element)); continue; }
    if (tag === 'p' && !element.textContent && !element.children.length) continue;
    out.push([tag, tag === 'a' ? element.getAttribute('href') : null, semanticChildren(element)]);
  }
  return out;
}

function signature(source: string, parse: HtmlParser): string {
  return JSON.stringify(semanticChildren(parse(source).body));
}

/** A legacy source with unsupported structure remains viewable without becoming a write. */
export function merchantContentEditorCanVisualize(source: string, bodyFormat: MerchantContentBodyFormat, editorHtml: string, parse: HtmlParser = browserParser): boolean {
  try {
    if (bodyFormat === 'legacy') {
      if (hasLossyLegacyMarkdownMetadata(source)) return false;
      normalizeMerchantContentBody(source);
    }
    const rendered = merchantContentEditorHtml(source, bodyFormat);
    const fromEditor = normalizeMerchantContentEditorHtml(editorHtml, parse);
    return signature(rendered, parse) === signature(fromEditor, parse);
  } catch { return false; }
}

/** One undo to the loaded semantics restores the exact source and original format. */
export function merchantContentEditorValueAfterEdit(original: string, bodyFormat: MerchantContentBodyFormat, loadedHtml: string, editorHtml: string, parse: HtmlParser = browserParser): MerchantContentBodyChange {
  const normalized = normalizeMerchantContentEditorHtml(editorHtml, parse);
  if (signature(loadedHtml, parse) === signature(normalized, parse)) return {value: original, bodyFormat};
  return {value: normalized, bodyFormat: 'normalized_html'};
}

export function merchantContentEditorBytes(source: string): number { return merchantContentBodyBytes(source); }

/** User-entered URLs must pass the same href policy as the authoritative body normalizer. */
export function safeMerchantContentLinkHref(raw: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const href = raw.trim();
  if (!href) return '';
  const candidate = /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(href) ? `https://${href}` : href;
  try {
    const escaped = candidate.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
    const result = normalizeMerchantContentBody(`<a href="${escaped}">x</a>`);
    return result.startsWith('<a href=') ? candidate : undefined;
  } catch { return undefined; }
}
