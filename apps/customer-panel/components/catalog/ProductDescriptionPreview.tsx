"use client";

import { createElement, useMemo, type ReactNode } from "react";
import { normalizeProductDescriptionRichText, type ProductDescriptionRichTextNode } from "@celebix/platform-config/src/product-description-rich-text";

type ProductDescriptionPreviewProps = Readonly<{ source?: string | null; emptyMessage?: string }>;

function renderRichTextNode(node: ProductDescriptionRichTextNode, key: string): ReactNode {
  if (node.type === "text") return node.value;
  const attributes: Record<string, unknown> = { key };
  if (node.tag === "a" && node.href) {
    attributes.href = node.href;
    if (node.external) {
      attributes.target = "_blank";
      attributes.rel = "noopener noreferrer nofollow";
    }
  }
  return createElement(
    node.tag,
    attributes,
    node.children.map((child, index) => renderRichTextNode(child, `${key}.${index}`)),
  );
}

export function ProductDescriptionPreview({
  source,
  emptyMessage = "Bu içerik henüz eklenmemiş.",
}: ProductDescriptionPreviewProps) {
  const richText = useMemo(
    () => normalizeProductDescriptionRichText(source),
    [source],
  );

  return (
    <section className="product-description-preview" aria-label="Biçimlendirilmiş içerik">
      {richText.length > 0 ? (
        <div className="product-description-rich-text">
          {richText.map((node, index) => renderRichTextNode(node, String(index)))}
        </div>
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}
