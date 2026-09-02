import type { LabelDocument, LabelDocumentItem } from "./document.ts";
import { barcodeModuleCount } from "./barcodes.ts";

function dots(mm: number, dpi: 203 | 300) {
  return Math.round((mm * dpi) / 25.4);
}
function safe(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replaceAll("İ", "I")
    .replaceAll("ş", "s")
    .replaceAll("Ş", "S")
    .replaceAll("ğ", "g")
    .replaceAll("Ğ", "G")
    .replaceAll("ç", "c")
    .replaceAll("Ç", "C")
    .replaceAll("ö", "o")
    .replaceAll("Ö", "O")
    .replaceAll("ü", "u")
    .replaceAll("Ü", "U")
    .replaceAll("₺", "TL ")
    .replace(/[\^~\u0000-\u001f\u007f]/g, " ")
    .replace(/[^\x20-\x7e]/g, "?");
}
function barcodeData(value: string) {
  return [...value]
    .map((character) =>
      "^~_\\".includes(character)
        ? `_${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
        : character,
    )
    .join("");
}
function moduleDots(
  item: LabelDocumentItem,
  availableDots: number,
  dpi: 203 | 300,
) {
  const modules = barcodeModuleCount(item.barcode.format, item.barcode.value);
  const width = Math.min(4, Math.floor(availableDots / modules));
  const scannerSafeMinimum =
    item.barcode.format === "ean13"
      ? dpi === 300
        ? 4
        : 3
      : dpi === 300
        ? 3
        : 2;
  if (width < scannerSafeMinimum)
    throw new TypeError("label_document_blocked");
  return width;
}
function one(document: LabelDocument, item: LabelDocumentItem, dpi: 203 | 300) {
  const width = dots(document.template.widthMm, dpi),
    height = dots(document.template.heightMm, dpi),
    left = dots(document.template.marginsMm.left, dpi),
    top = dots(document.template.marginsMm.top, dpi),
    barcodeHeight = dots(item.barcode.heightMm, dpi),
    availableWidth = width - left - dots(document.template.marginsMm.right, dpi),
    module = moduleDots(item, availableWidth, dpi),
    barcodeX = left + item.barcode.quietZoneModules * module;
  let y = top;
  const lines = [
    "^XA",
    `^FX Unicode transliterated for the selected Zebra ${dpi} DPI profile`,
    `^PW${width}`,
    `^LL${height}`,
    "^LH0,0",
  ];
  for (const field of item.fields) {
    if (field.key === "barcodeSymbol") {
      if (item.barcode.format === "ean13")
        lines.push(
          `^FO${barcodeX},${y}^BY${module}^BEN,${barcodeHeight},${item.barcode.showHumanReadable ? "Y" : "N"},N^FD${item.barcode.value.slice(0, 12)}^FS`,
        );
      else
        lines.push(
          `^FO${barcodeX},${y}^BY${module}^BCN,${barcodeHeight},${item.barcode.showHumanReadable ? "Y" : "N"},N,N,A^FH_^FD${barcodeData(item.barcode.value)}^FS`,
        );
      y += barcodeHeight + (item.barcode.showHumanReadable ? dots(3, dpi) : 0);
      continue;
    }
    const font = Math.max(14, Math.round((field.fontSizePt * dpi) / 72));
    lines.push(
      `^FO${left},${y}^A0N,${font},${font}^FB${availableWidth},${field.maxLines},2,${field.align === "center" ? "C" : field.align === "right" ? "R" : "L"},0^FD${safe(field.value)}^FS`,
    );
    y += font * Math.max(1, field.value.split("\n").length) + 2;
  }
  lines.push("^XZ");
  return lines.join("\n");
}
export function renderLabelZpl(
  document: LabelDocument,
  dpi: 203 | 300,
): string {
  if (
    document.errors.length > 0 ||
    document.labelCount < 1 ||
    ![203, 300].includes(dpi)
  )
    throw new TypeError("label_document_blocked");
  return document.items
    .flatMap((item) =>
      Array.from({ length: item.quantity }, () => one(document, item, dpi)),
    )
    .join("\n");
}
