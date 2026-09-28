import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { normalizePastedProductDescriptionHtml } from "./product-description-editor.ts";

type HtmlParser = (source: string) => Document;

const SUPPORTED_ELEMENTS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "del", "s", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "a", "pre", "code", "hr", "table", "thead",
  "tbody", "tr", "th", "td",
]);
const INLINE_ELEMENTS = new Set(["br", "strong", "b", "em", "i", "u", "del", "s", "a", "code"]);
const MARK_NAMES: Readonly<Record<string, string>> = {
  strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", del: "strike", s: "strike", code: "code",
};

function browserParser(source: string): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

/** Source format is descriptive only; reading a document never converts its stored value. */
export function policyBodySourceFormat(source: string): "html" | "markdown" {
  return /<\/?[a-z][\s\S]*>/i.test(source) ? "html" : "markdown";
}

export function policyBodyEditorHtml(source: string): string {
  return normalizeProductDescriptionHtml(source);
}

/** Use the existing storefront sanitizer for pasted and edited content as well. */
export function sanitizePolicyBodyPaste(source: string, parse: HtmlParser = browserParser): string {
  return normalizePastedProductDescriptionHtml(source, parse);
}

export function safePolicyLinkHref(value: string): string | undefined {
  const href = value.trim();
  if (!href) return "";
  if (/[\u0000-\u0020\u007f-\u009f\\]/.test(href)) return undefined;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(href) || /^tel:\+?[\d().-]+(?:;ext=\d+)?$/i.test(href)) return href;
  const candidate = /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(href) ? `https://${href}` : href;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Documents with semantics outside the installed editor's schema remain source-editable.
 * Inspect the original HTML before sanitizing so a removed image, attribute, or heading
 * cannot silently become a different document on the first visual edit.
 */
export function policyBodyHasUnsupportedStructure(source: string, parse: HtmlParser = browserParser): boolean {
  if (policyBodySourceFormat(source) === "markdown") {
    return /!\[[^\]]*\]\s*(?:\(|\[)/.test(source);
  }
  const document = parse(source);
  return Array.from(document.body.querySelectorAll("*")).some((element) => {
    const tag = element.tagName.toLowerCase();
    if (!SUPPORTED_ELEMENTS.has(tag)) return true;
    return Array.from(element.attributes).some(({ name }) => (
      tag !== "a" || !["href", "target", "rel"].includes(name.toLowerCase())
    ));
  });
}

type SemanticToken =
  | Readonly<{ text: string; marks: readonly string[] }>
  | Readonly<{ tag: string; children: readonly SemanticToken[] }>;

function appendToken(tokens: SemanticToken[], token: SemanticToken) {
  const previous = tokens.at(-1);
  if ("text" in token && previous && "text" in previous && previous.marks.join("|") === token.marks.join("|")) {
    tokens[tokens.length - 1] = { text: previous.text + token.text, marks: previous.marks };
  } else {
    tokens.push(token);
  }
}

function semanticChildren(parent: Node, marks: readonly string[] = [], preformatted = false): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const parentTag = parent.nodeType === 1 ? (parent as Element).tagName.toLowerCase() : "root";
  const hasBlocks = Array.from(parent.childNodes).some((node) => node.nodeType === 1 && !INLINE_ELEMENTS.has((node as Element).tagName.toLowerCase()));

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3) {
      const raw = child.textContent ?? "";
      if (hasBlocks && /^\s*$/.test(raw)) continue;
      const text = preformatted ? raw : raw.replace(/[\t\n\r\f ]+/g, " ");
      if (text) appendToken(tokens, { text, marks: [...marks].sort() });
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    const mark = MARK_NAMES[tag];
    if (mark || tag === "a") {
      const href = tag === "a" ? element.getAttribute("href") : undefined;
      const nextMark = mark ?? (href ? `link:${href}` : "");
      for (const token of semanticChildren(element, nextMark ? [...new Set([...marks, nextMark])] : marks, preformatted)) appendToken(tokens, token);
      continue;
    }
    if (tag === "thead" || tag === "tbody") {
      for (const token of semanticChildren(element, marks, preformatted)) appendToken(tokens, token);
      continue;
    }
    const children = semanticChildren(element, marks, preformatted || tag === "pre");
    if (tag === "p" && children.length === 0) continue;
    appendToken(tokens, { tag, children });
  }

  // Tiptap requires paragraph nodes in list items and cells. Their wrappers carry
  // no extra meaning when they contain just the same inline content as the source.
  if (["li", "th", "td"].includes(parentTag)) {
    const inline: SemanticToken[] = [];
    const blocks: SemanticToken[] = [];
    function flushInline() {
      if (inline.length) {
        blocks.push({ tag: "p", children: inline.splice(0) });
      }
    }
    for (const token of tokens) {
      if ("text" in token || token.tag === "br") inline.push(token);
      else {
        flushInline();
        blocks.push(token);
      }
    }
    flushInline();
    return blocks;
  }
  return tokens;
}

/** Compare rendered semantics, including inline spacing, heading level and nesting. */
export function policyBodySemanticSignature(html: string, parse: HtmlParser = browserParser): string {
  return JSON.stringify(semanticChildren(parse(html).body));
}

export function policyBodyRoundTripSupported(source: string, editorHtml: string, parse: HtmlParser = browserParser): boolean {
  return !policyBodyHasUnsupportedStructure(source, parse)
    && policyBodySemanticSignature(policyBodyEditorHtml(source), parse) === policyBodySemanticSignature(policyBodyEditorHtml(editorHtml), parse);
}

/** Undo back to the loaded document restores its original Markdown/HTML exactly. */
export function policyBodyValueAfterEdit(
  originalSource: string,
  originalEditorHtml: string,
  editedHtml: string,
  parse: HtmlParser = browserParser,
): string {
  const safeHtml = policyBodyEditorHtml(editedHtml);
  return policyBodySemanticSignature(originalEditorHtml, parse) === policyBodySemanticSignature(safeHtml, parse)
    ? originalSource
    : safeHtml;
}
