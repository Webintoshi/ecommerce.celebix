"use client";

import { useId, useMemo, useState } from "react";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text";

type ProductDescriptionPreviewProps = Readonly<{
  source?: string | null;
  emptyMessage?: string;
}>;

type ProductDescriptionFieldProps = Readonly<{
  defaultValue?: string;
  readOnly?: boolean;
  rows?: number;
  className?: string;
}>;

export function ProductDescriptionPreview({
  source,
  emptyMessage = "Önizlemek için açıklama yazın.",
}: ProductDescriptionPreviewProps) {
  const html = useMemo(
    () => normalizeProductDescriptionHtml(source),
    [source],
  );

  return (
    <section className="product-description-preview" aria-label="Markdown önizleme">
      <strong>Markdown önizleme</strong>
      {html ? (
        <div
          className="product-description-rich-text"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}

export function ProductDescriptionField({
  defaultValue = "",
  readOnly = false,
  rows = 5,
  className = "",
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
      <ProductDescriptionPreview source={source} />
    </div>
  );
}
