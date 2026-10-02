import MarkdownIt, { type Options } from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export type ToshiMarkdownTag =
  | "p" | "h3" | "h4" | "h5" | "h6"
  | "strong" | "em" | "s" | "blockquote"
  | "ul" | "ol" | "li" | "pre" | "code" | "br" | "hr"
  | "table" | "thead" | "tbody" | "tr" | "th" | "td";

export type ToshiMarkdownNode =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{
    kind: "element";
    tag: ToshiMarkdownTag;
    children: readonly ToshiMarkdownNode[];
    start?: number;
    align?: "left" | "center" | "right";
  }>;

const options: Options & Readonly<{ maxNesting: number }> = {
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
  maxNesting: 24,
};
const markdown = new MarkdownIt(options);
const safeTags = new Set<string>([
  "p", "h3", "h4", "h5", "h6", "strong", "em", "s", "blockquote",
  "ul", "ol", "li", "pre", "code", "br", "hr", "table", "thead", "tbody", "tr", "th", "td",
]);

interface Frame {
  children: ToshiMarkdownNode[];
  tag?: ToshiMarkdownTag;
  linkTarget?: string;
  start?: number;
  align?: "left" | "center" | "right";
}

function text(value: string): ToshiMarkdownNode {
  return { kind: "text", text: value };
}

function plainText(nodes: readonly ToshiMarkdownNode[]): string {
  return nodes.map((node) => node.kind === "text" ? node.text : plainText(node.children)).join("");
}

function safeTag(token: Token): ToshiMarkdownTag | undefined {
  const heading = /^h([1-6])$/.exec(token.tag);
  const tag = heading ? `h${Math.min(6, Math.max(3, Number(heading[1]) + 1))}` : token.tag;
  return safeTags.has(tag) ? tag as ToshiMarkdownTag : undefined;
}

function closeFrame(frames: Frame[]): void {
  if (frames.length < 2) return;
  const frame = frames.pop()!;
  const parent = frames.at(-1)!;
  if (frame.linkTarget && plainText(frame.children) !== frame.linkTarget) {
    frame.children.push(text(` (${frame.linkTarget})`));
  }
  if (frame.tag) {
    parent.children.push({
      kind: "element", tag: frame.tag, children: frame.children,
      ...(frame.start === undefined ? {} : { start: frame.start }),
      ...(frame.align === undefined ? {} : { align: frame.align }),
    });
  } else {
    parent.children.push(...frame.children);
  }
}

function parseTokens(tokens: readonly Token[]): ToshiMarkdownNode[] {
  const root: Frame = { children: [] };
  const frames = [root];
  for (const token of tokens) {
    const current = frames.at(-1)!;
    if (token.type === "inline") {
      current.children.push(...parseTokens(token.children ?? []));
    } else if (token.type === "image") {
      const source = token.attrGet("src");
      current.children.push(text(`[Görsel: ${token.content || "görsel"}]${source ? ` (${source})` : ""}`));
    } else if (token.nesting === 1) {
      const frame: Frame = { children: [] };
      if (token.type === "link_open") {
        frame.linkTarget = token.attrGet("href") ?? undefined;
      } else {
        frame.tag = safeTag(token);
        const start = token.attrGet("start");
        if (frame.tag === "ol" && start && /^\d{1,9}$/.test(start)) frame.start = Number(start);
        if (frame.tag === "th" || frame.tag === "td") {
          const alignment = /^text-align:(left|center|right)$/.exec(token.attrGet("style") ?? "");
          if (alignment) frame.align = alignment[1] as "left" | "center" | "right";
        }
      }
      frames.push(frame);
    } else if (token.nesting === -1) {
      closeFrame(frames);
    } else if (token.type === "fence" || token.type === "code_block") {
      current.children.push({ kind: "element", tag: "pre", children: [
        { kind: "element", tag: "code", children: [text(token.content)] },
      ] });
    } else if (token.type === "code_inline") {
      current.children.push({ kind: "element", tag: "code", children: [text(token.content)] });
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      current.children.push({ kind: "element", tag: "br", children: [] });
    } else if (token.type === "hr") {
      current.children.push({ kind: "element", tag: "hr", children: [] });
    } else if (token.content) {
      current.children.push(text(token.content));
    }
  }
  while (frames.length > 1) closeFrame(frames);
  return root.children;
}

/** Parse response formatting into an inert, fixed React element vocabulary. */
export function parseToshiMarkdown(value: string): readonly ToshiMarkdownNode[] {
  return parseTokens(markdown.parse(value, {}));
}
