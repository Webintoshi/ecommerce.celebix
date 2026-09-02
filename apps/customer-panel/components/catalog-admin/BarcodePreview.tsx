"use client";
import { useMemo } from "react";
import * as bwipjs from "@bwip-js/browser";
import type {
  LabelDocument,
  LabelDocumentItem,
} from "@/lib/barcode-labels/document.ts";
import { previewPaddingPercentages } from "@/lib/barcode-labels/preview-geometry.ts";

export function BarcodePreview({
  item,
  template,
}: {
  item: LabelDocumentItem;
  template: LabelDocument["template"];
}) {
  const svg = useMemo(() => {
    try {
      return bwipjs.toSVG({
        bcid: item.barcode.format === "ean13" ? "ean13" : "code128",
        text: item.barcode.value,
        scale: 2,
        height: item.barcode.heightMm,
        includetext: item.barcode.showHumanReadable,
        textxalign: "center",
        paddingwidth: item.barcode.format === "ean13" ? 11 : 10,
        backgroundcolor: "FFFFFF",
        barcolor: "111827",
      });
    } catch {
      return "";
    }
  }, [item]);
  return (
    <div
      className="barcode-live-label"
      style={{
        aspectRatio: `${template.widthMm}/${template.heightMm}`,
        ...previewPaddingPercentages(template),
      }}
      aria-label={`Etiket önizlemesi: ${item.source.productTitle}`}
    >
      {item.fields.map((field) =>
        field.key === "barcodeSymbol" ? (
          <div
            key={field.key}
            className="barcode-live-symbol"
            role="img"
            aria-label={`Barkod ${item.barcode.value}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div
            key={field.key}
            style={{
              fontSize: `${field.fontSizePt}pt`,
              textAlign: field.align,
              fontWeight:
                field.key === "productTitle" || field.key === "price"
                  ? 700
                  : 500,
              whiteSpace: "pre-line",
              overflow: "hidden",
            }}
          >
            {field.value}
          </div>
        ),
      )}
    </div>
  );
}
