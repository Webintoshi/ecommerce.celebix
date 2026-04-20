import { createElement, Fragment, type CSSProperties, type ReactNode } from "react";

interface CodeIntegrationMarkupProps {
  html: string;
}

const SELF_CLOSING_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const BOOLEAN_ATTRIBUTES = new Set([
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "hidden",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

const ATTRIBUTE_NAME_MAP: Record<string, string> = {
  class: "className",
  crossorigin: "crossOrigin",
  charset: "charSet",
  "http-equiv": "httpEquiv",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  autocomplete: "autoComplete",
  maxlength: "maxLength",
  minlength: "minLength",
  srcset: "srcSet",
  referrerpolicy: "referrerPolicy",
  acceptcharset: "acceptCharset",
  allowfullscreen: "allowFullScreen",
  playsinline: "playsInline",
};

const ATTRIBUTE_REGEX =
  /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TAG_REGEX =
  /<([a-zA-Z][\w:-]*)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z][\w:-]*)([^>]*)\/?>/g;

function toStyleObject(value: string): CSSProperties {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<CSSProperties>((styles, declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex === -1) {
        return styles;
      }

      const property = declaration.slice(0, separatorIndex).trim();
      const rawValue = declaration.slice(separatorIndex + 1).trim();

      if (!property || !rawValue) {
        return styles;
      }

      const reactProperty = property.replace(/-([a-z])/g, (_, letter: string) =>
        letter.toUpperCase(),
      ) as keyof CSSProperties;
      styles[reactProperty] = rawValue as never;
      return styles;
    }, {});
}

function parseAttributes(source: string) {
  const attributes: Record<string, string | boolean | CSSProperties> = {};

  for (const match of source.matchAll(ATTRIBUTE_REGEX)) {
    const rawName = match[1]?.trim();
    if (!rawName) {
      continue;
    }

    const normalizedName = rawName.toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (normalizedName === "style") {
      attributes.style = toStyleObject(rawValue);
      continue;
    }

    if (BOOLEAN_ATTRIBUTES.has(normalizedName) && rawValue === "") {
      attributes[ATTRIBUTE_NAME_MAP[normalizedName] ?? rawName] = true;
      continue;
    }

    attributes[ATTRIBUTE_NAME_MAP[normalizedName] ?? rawName] = rawValue;
  }

  return attributes;
}

function parseHtml(html: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const normalizedHtml = html.trim();

  if (!normalizedHtml) {
    return nodes;
  }

  for (const [index, match] of Array.from(normalizedHtml.matchAll(TAG_REGEX)).entries()) {
    const tagName = (match[1] || match[4] || "").trim();
    if (!tagName) {
      continue;
    }

    const attributeSource = match[2] || match[5] || "";
    const innerHtml = (match[3] || "").trim();
    const props = {
      key: `${tagName}-${index}`,
      ...parseAttributes(attributeSource),
    } as Record<string, unknown>;

    if (!SELF_CLOSING_TAGS.has(tagName.toLowerCase()) && innerHtml) {
      props.dangerouslySetInnerHTML = { __html: innerHtml };
    }

    nodes.push(createElement(tagName, props));
  }

  return nodes;
}

export default function CodeIntegrationMarkup({ html }: CodeIntegrationMarkupProps) {
  const nodes = parseHtml(html);

  if (nodes.length === 0) {
    return null;
  }

  return createElement(Fragment, null, ...nodes);
}
