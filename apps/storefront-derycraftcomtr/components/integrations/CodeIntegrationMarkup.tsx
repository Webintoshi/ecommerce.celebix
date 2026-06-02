import { createElement, Fragment } from "react";

interface CodeIntegrationMarkupProps {
  html: string;
}

const VOID_TAGS = new Set(["base", "link", "meta"]);
const ALLOWED_TAGS = new Set([
  "base",
  "div",
  "iframe",
  "img",
  "link",
  "meta",
  "noscript",
  "script",
  "span",
  "style",
]);

function normalizeAttributeName(name: string) {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  if (name === "crossorigin") return "crossOrigin";
  if (name === "referrerpolicy") return "referrerPolicy";
  return name;
}

function parseAttributes(value: string) {
  const props: Record<string, string | boolean> = {};
  const attributeRegex = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributeRegex.exec(value))) {
    const rawName = match[1]?.trim();
    if (!rawName || rawName === "/") continue;

    const name = normalizeAttributeName(rawName.toLowerCase());
    props[name] = match[2] ?? match[3] ?? match[4] ?? true;
  }

  return props;
}

export default function CodeIntegrationMarkup({ html }: CodeIntegrationMarkupProps) {
  const normalizedHtml = html.trim();

  if (!normalizedHtml) {
    return null;
  }

  const nodes = [];
  const tagRegex = /<([a-zA-Z][\w-]*)([^>]*)>([\s\S]*?)<\/\1>|<((?:base|link|meta))([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tagRegex.exec(normalizedHtml))) {
    const tagName = (match[1] || match[4] || "").toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      continue;
    }

    const props = {
      ...parseAttributes(match[2] || match[5] || ""),
      key: `${tagName}-${index}`,
    };
    index += 1;

    if (VOID_TAGS.has(tagName)) {
      nodes.push(createElement(tagName, props));
      continue;
    }

    nodes.push(
      createElement(tagName, {
        ...props,
        dangerouslySetInnerHTML: { __html: match[3] || "" },
      }),
    );
  }

  return nodes.length > 0 ? createElement(Fragment, null, ...nodes) : null;
}
