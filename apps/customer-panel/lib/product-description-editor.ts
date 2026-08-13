import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";

type HtmlParser = (source: string) => Document;

const REMOVED_ELEMENTS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
  "video",
  "audio",
  "nav",
  "menu",
  "template",
].join(",");

function browserParser(source: string): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

function replaceElementTag(element: Element, tagName: "h2" | "h3"): Element {
  const replacement = element.ownerDocument.createElement(tagName);
  while (element.firstChild) replacement.append(element.firstChild);
  element.replaceWith(replacement);
  return replacement;
}

function wrapContents(element: Element, tagName: "strong" | "em" | "u" | "del") {
  const wrapper = element.ownerDocument.createElement(tagName);
  while (element.firstChild) wrapper.append(element.firstChild);
  element.append(wrapper);
}

function preserveInlineSemantics(element: Element, style: string) {
  const normalized = style.toLowerCase();
  const weight = normalized.match(/font-weight\s*:\s*([^;]+)/)?.[1]?.trim();
  const numericWeight = weight ? Number.parseInt(weight, 10) : Number.NaN;
  const isBold = weight === "bold" || weight === "bolder" || (!Number.isNaN(numericWeight) && numericWeight >= 600);
  const isItalic = /font-style\s*:\s*(italic|oblique)/.test(normalized);
  const decoration = normalized.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/)?.[1] ?? "";

  if (/line-through/.test(decoration)) wrapContents(element, "del");
  if (/underline/.test(decoration)) wrapContents(element, "u");
  if (isItalic) wrapContents(element, "em");
  if (isBold) wrapContents(element, "strong");
}

function normalizeWordHeading(element: Element, style: string): Element {
  if (!/^(p|div)$/i.test(element.tagName)) return element;
  const signature = `${element.getAttribute("class") ?? ""} ${style}`;
  if (/msoheading3|heading\s*3|mso-outline-level\s*:\s*2/i.test(signature)) {
    return replaceElementTag(element, "h3");
  }
  if (/msoheading[12]|heading\s*[12]|mso-outline-level\s*:\s*[01]/i.test(signature)) {
    return replaceElementTag(element, "h2");
  }
  return element;
}

function wordListType(element: Element): "ul" | "ol" | undefined {
  if (!/^(p|div)$/i.test(element.tagName)) return undefined;
  const signature = `${element.getAttribute("class") ?? ""} ${element.getAttribute("style") ?? ""}`;
  if (!/MsoListParagraph|mso-list\s*:/i.test(signature)) return undefined;
  const marker = Array.from(element.querySelectorAll("[style]"))
    .find((node) => /mso-list\s*:\s*ignore/i.test(node.getAttribute("style") ?? ""))
    ?.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
  return /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]/i.test(marker) ? "ol" : "ul";
}

function normalizeWordLists(document: Document) {
  let currentList: Element | undefined;
  let currentType: "ul" | "ol" | undefined;

  for (const paragraph of Array.from(document.body.children)) {
    const listType = wordListType(paragraph);
    if (!listType) {
      currentList = undefined;
      currentType = undefined;
      continue;
    }

    if (!currentList || currentType !== listType) {
      currentList = document.createElement(listType);
      paragraph.before(currentList);
      currentType = listType;
    }

    for (const marker of Array.from(paragraph.querySelectorAll("[style]"))) {
      if (/mso-list\s*:\s*ignore/i.test(marker.getAttribute("style") ?? "")) marker.remove();
    }
    const item = document.createElement("li");
    while (paragraph.firstChild) item.append(paragraph.firstChild);
    currentList.append(item);
    paragraph.remove();
  }
}

export function normalizePastedProductDescriptionHtml(
  source: string,
  parse: HtmlParser = browserParser,
): string {
  if (!source.trim()) return "";

  const document = parse(source);
  for (const element of Array.from(document.body.querySelectorAll(REMOVED_ELEMENTS))) {
    element.remove();
  }
  normalizeWordLists(document);

  for (const originalElement of Array.from(document.body.querySelectorAll("*"))) {
    if (!originalElement.isConnected) continue;
    const style = originalElement.getAttribute("style") ?? "";
    const element = normalizeWordHeading(originalElement, style);
    preserveInlineSemantics(element, style);
  }

  return normalizeProductDescriptionHtml(
    document.body.innerHTML.trim(),
  );
}

export function normalizeStoredProductDescription(source?: string | null): string {
  return normalizeProductDescriptionHtml(source);
}
