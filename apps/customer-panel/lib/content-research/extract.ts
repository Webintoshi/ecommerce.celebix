import { Parser } from "htmlparser2";

export type ContentResearchMediaType = "text/html" | "text/plain";
export type ContentResearchExtractInput = Readonly<{ text: string; mediaType: ContentResearchMediaType }>;
export type ContentResearchExtractedText = Readonly<{ title: string; text: string }>;

export class ContentResearchExtractError extends Error {
  constructor(readonly code: "content_research_extraction_invalid" | "content_research_extraction_too_large") {
    super(code);
    this.name = "ContentResearchExtractError";
  }
}

const MAX_RAW_BYTES = 524_288;
const MAX_TEXT_BYTES = 12_000;
const MAX_TITLE_BYTES = 500;
const MAX_DEPTH = 64;
const MAX_NODES = 20_000;
const SKIP = new Set(["script", "style", "template", "form", "nav", "svg", "math", "iframe", "object", "noscript"]);
const BLOCK = new Set(["address", "article", "blockquote", "br", "dd", "div", "dl", "dt", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "main", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"]);
const BAD_UNICODE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const encoder = new TextEncoder();

function fail(code: ContentResearchExtractError["code"]): never { throw new ContentResearchExtractError(code); }

function normalize(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[\t\f\v ]+/g, " ").replace(/ *\n+ */g, "\n").trim();
}

function title(value: string): string {
  if (BAD_UNICODE.test(value)) return fail("content_research_extraction_invalid");
  const clean = normalize(value).replace(/\s+/g, " ");
  let selected = "";
  for (const point of clean) {
    if (encoder.encode(selected + point).byteLength > MAX_TITLE_BYTES) break;
    selected += point;
  }
  return selected;
}

function boundedText(value: string): string {
  if (BAD_UNICODE.test(value)) return fail("content_research_extraction_invalid");
  const clean = normalize(value);
  if (!clean) return fail("content_research_extraction_invalid");
  if (encoder.encode(clean).byteLength > MAX_TEXT_BYTES) return fail("content_research_extraction_too_large");
  return clean;
}

type Frame = Readonly<{ name: string; hidden: boolean; inHead: boolean; inTitle: boolean; inH1: boolean }>;

function htmlText(source: string): ContentResearchExtractedText {
  const frames: Frame[] = [];
  const body: string[] = [];
  const pageTitle: string[] = [];
  const firstHeading: string[] = [];
  let nodes = 0;
  let firstHeadingClosed = false;
  const count = () => { if (++nodes > MAX_NODES) fail("content_research_extraction_invalid"); };
  const parser = new Parser({
    onopentag(name, attributes) {
      count();
      if (frames.length >= MAX_DEPTH) fail("content_research_extraction_invalid");
      const parent = frames.at(-1);
      const hidden = !!parent?.hidden || SKIP.has(name) || Object.hasOwn(attributes, "hidden") || attributes["aria-hidden"]?.toLowerCase() === "true" || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*(?:;|$|!important))/i.test(attributes.style ?? "");
      const inHead = !!parent?.inHead || name === "head";
      const inTitle = !!parent?.inTitle || name === "title";
      const inH1 = !!parent?.inH1 || name === "h1";
      frames.push({ name, hidden, inHead, inTitle, inH1 });
      if (!hidden && !inHead && !inTitle && BLOCK.has(name)) body.push("\n");
    },
    ontext(value) {
      count();
      const current = frames.at(-1);
      if (current?.hidden) return;
      if (current?.inTitle) { pageTitle.push(value); return; }
      if (current?.inHead) return;
      body.push(value);
      if (!firstHeadingClosed && current?.inH1) firstHeading.push(value);
    },
    onclosetag(name) {
      const current = frames.at(-1);
      if (current && !current.hidden && !current.inHead && !current.inTitle && BLOCK.has(name)) body.push("\n");
      if (name === "h1" && !firstHeadingClosed && firstHeading.length > 0) firstHeadingClosed = true;
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index]!.name === name) { frames.splice(index); break; }
      }
    },
    oncomment() { count(); },
    onprocessinginstruction() { count(); },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  try { parser.end(source); }
  catch (caught) { if (caught instanceof ContentResearchExtractError) throw caught; return fail("content_research_extraction_invalid"); }
  const text = boundedText(body.join(""));
  const selectedTitle = title(pageTitle.join("")) || title(firstHeading.join("")) || title(text.split("\n", 1)[0]!);
  return Object.freeze({ title: selectedTitle, text });
}

/** Treat source prose as untrusted evidence; this parser never loads assets or evaluates scripts. */
export function extractContentResearchText(input: ContentResearchExtractInput): ContentResearchExtractedText {
  if (!input || (input.mediaType !== "text/html" && input.mediaType !== "text/plain") || typeof input.text !== "string") return fail("content_research_extraction_invalid");
  if (BAD_UNICODE.test(input.text)) return fail("content_research_extraction_invalid");
  if (input.text.length > MAX_RAW_BYTES) return fail("content_research_extraction_too_large");
  if (encoder.encode(input.text).byteLength > MAX_RAW_BYTES) return fail("content_research_extraction_too_large");
  if (input.mediaType === "text/html") return htmlText(input.text);
  const text = boundedText(input.text);
  return Object.freeze({ title: title(text.split("\n", 1)[0]!), text });
}
