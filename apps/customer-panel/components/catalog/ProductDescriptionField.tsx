"use client";

import { createElement, useId, useMemo, useState, type ReactNode } from "react";
import {
  normalizeProductDescriptionRichText,
  type ProductDescriptionRichTextNode,
} from "@celebix/platform-config/src/product-description-rich-text";

type ProductDescriptionPreviewProps = Readonly<{
  source?: string | null;
  emptyMessage?: string;
}>;

type ProductDescriptionFieldProps = Readonly<{
  defaultValue?: string;
  readOnly?: boolean;
  rows?: number;
  className?: string;
  previewCollapsed?: boolean;
}>;

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
  emptyMessage = "Önizlemek için açıklama yazın.",
}: ProductDescriptionPreviewProps) {
  const richText = useMemo(
    () => normalizeProductDescriptionRichText(source),
    [source],
  );

  return (
    <section className="product-description-preview" aria-label="Markdown önizleme">
      <strong>Markdown önizleme</strong>
      {richText.length > 0 ? (
        <div className="product-description-rich-text">
          {richText.map((node, index) => renderRichTextNode(node, String(index)))}
        </div>
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}

export function ProductDescriptionField({
  defaultValue = "",
  readOnly = false,
  rows = 5,
  className = "",
  previewCollapsed = false,
}: ProductDescriptionFieldProps) {
  const id = useId();
  const [source, setSource] = useState(defaultValue);

  return (
    <div className={`product-description-field ${className}`.trim()}>
      <label htmlFor={id}>
        <span>Açıklama</span>
        <small>Markdown desteklenir</small>
      </label>
      <textarea
        id={id}
        name="description"
        maxLength={10_000}
        rows={rows}
        value={source}
        readOnly={readOnly}
        onChange={(event) => setSource(event.target.value)}
      />
      {previewCollapsed ? <details className="product-description-preview-disclosure"><summary>Markdown önizleme</summary><ProductDescriptionPreview source={source} /></details> : <ProductDescriptionPreview source={source} />}
    </div>
  );
}
