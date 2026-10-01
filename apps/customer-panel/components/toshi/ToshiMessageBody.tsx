import { createElement, memo, type ReactNode } from "react";
import { parseToshiMarkdown, type ToshiMarkdownNode } from "../../lib/toshi-chat-ui/markdown.ts";

function renderNodes(nodes: readonly ToshiMarkdownNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.kind === "text") return node.text;
    const key = `${prefix}-${index}`;
    const content = createElement(node.tag, {
      key,
      ...(node.tag === "ol" && node.start !== undefined ? { start: node.start } : {}),
      ...(node.align === undefined ? {} : { style: { textAlign: node.align } }),
    }, node.tag === "br" || node.tag === "hr" ? undefined : renderNodes(node.children, key));
    return node.tag === "table"
      ? createElement("div", { key, "data-toshi-table": true, tabIndex: 0, role: "region", "aria-label": "Yanıt tablosu" }, content)
      : content;
  });
}

export const ToshiMessageBody = memo(function ToshiMessageBody({ text }: Readonly<{ text: string }>) {
  return createElement("div", { "data-toshi-message-body": true }, renderNodes(parseToshiMarkdown(text), "toshi"));
});
