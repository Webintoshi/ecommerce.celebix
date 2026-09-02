import * as bwipjs from "@bwip-js/node";
import type { BarcodeFormat } from "@celebix/saas-contracts";
import { validateBarcodeValue } from "./barcodes.ts";

export function renderBarcodeSvg(
  format: BarcodeFormat,
  value: string,
  heightMm: number,
  showHumanReadable: boolean,
): string {
  const validation = validateBarcodeValue(format, value);
  if (!validation.valid) throw new TypeError(validation.code);
  if (
    typeof heightMm !== "number" ||
    !Number.isFinite(heightMm) ||
    heightMm < 3 ||
    heightMm > 100
  )
    throw new TypeError("barcode_height_invalid");
  const svg = bwipjs.toSVG({
    bcid: format === "ean13" ? "ean13" : "code128",
    text: value,
    scale: 2,
    height: heightMm,
    includetext: showHumanReadable,
    textxalign: "center",
    paddingwidth: format === "ean13" ? 11 : 10,
    backgroundcolor: "FFFFFF",
    barcolor: "111827",
  });
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return svg.replace(
    "<svg ",
    `<svg role="img" aria-label="Barkod ${escaped}" data-barcode-value="${escaped}" `,
  );
}

export async function renderBarcodePng(
  format: BarcodeFormat,
  value: string,
  heightMm: number,
): Promise<Buffer> {
  const validation = validateBarcodeValue(format, value);
  if (!validation.valid) throw new TypeError(validation.code);
  return bwipjs.toBuffer({
    bcid: format === "ean13" ? "ean13" : "code128",
    text: value,
    scale: 4,
    height: heightMm,
    includetext: false,
    paddingwidth: format === "ean13" ? 11 : 10,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
}
