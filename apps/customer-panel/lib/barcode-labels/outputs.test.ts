import assert from "node:assert/strict";
import test from "node:test";
import type { BarcodePrintJob } from "@celebix/saas-contracts";
import { getSystemBarcodeLabelTemplate } from "./system-templates.ts";
import { buildLabelDocument } from "./document.ts";
import zxing from "@zxing/library";
import { PNG } from "pngjs";
import { renderBarcodePng, renderBarcodeSvg } from "./render-barcode.ts";
import { buildLabelPdfDefinition, renderLabelPdf } from "./pdf.ts";
import { renderLabelZpl } from "./zpl.ts";

const id = (n: string) => `10000000-0000-4000-8000-${n.padStart(12, "0")}`;
const row = {
  productId: id("1"),
  productVersion: 1,
  variantId: id("2"),
  variantVersion: 1,
  productTitle: "Türkçe Şık Kolye",
  variantTitle: "14 Ayar",
  sku: "KLY-001",
  barcode: "000ABC123",
  priceCents: 895000,
  currency: "TRY",
  stock: 3,
  trackInventory: true,
  attributes: { Ayar: "14 Ayar" },
  status: "active",
  updatedAt: "2026-09-02T12:00:00.000Z",
} as const;
const template = getSystemBarcodeLabelTemplate("retail-50x30")!;
const document = buildLabelDocument({
  templateName: template.name,
  template: template.config,
  printerProfile: "thermal",
  startCell: 0,
  items: [{ row, quantity: 2 }],
  storeName: "Güzide Kuyumcu",
});
const {
  BarcodeFormat: ZxingFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} = zxing;
const job = {
  id: id("3"),
  principalId: id("4"),
  storeName: "Güzide Kuyumcu",
  templateName: template.name,
  templateConfig: template.config,
  outputType: "pdf",
  printerProfile: "thermal",
  startCell: 0,
  variantCount: 1,
  labelCount: 2,
  status: "prepared",
  items: [{ variantId: row.variantId, quantity: 2, snapshot: row }],
  createdAt: "2026-09-02T12:00:00.000Z",
} as BarcodePrintJob;

test("Code 128 renderer returns real vector bars and preserves leading zeroes", () => {
  const svg = renderBarcodeSvg("code128", "000ABC123", 10, true);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path|<rect/);
  assert.match(svg, /000ABC123/);
});
test("independent ZXing decoder reads Code 128 and valid EAN-13 output", async () => {
  for (const [format, value, zxing] of [
    ["code128", "000ABC123", ZxingFormat.CODE_128],
    ["ean13", "4006381333931", ZxingFormat.EAN_13],
  ] as const) {
    const png = PNG.sync.read(await renderBarcodePng(format, value, 15));
    const grey = new Uint8ClampedArray(png.width * png.height);
    for (let pixel = 0; pixel < grey.length; pixel += 1) {
      const offset = pixel * 4;
      grey[pixel] = Math.round(
        (png.data[offset]! + png.data[offset + 1]! + png.data[offset + 2]!) / 3,
      );
    }
    const luminance = new RGBLuminanceSource(grey, png.width, png.height);
    const reader = new MultiFormatReader();
    reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS, [zxing]]]));
    const decoded = reader.decode(
      new BinaryBitmap(new HybridBinarizer(luminance)),
    );
    assert.equal(decoded.getText(), value);
  }
});
test("independent decoder reads the compact non-GTIN internal Code 128 form", async () => {
  const value = "CXI-000000000123";
  const png = PNG.sync.read(await renderBarcodePng("code128", value, 15));
  const grey = new Uint8ClampedArray(png.width * png.height);
  for (let pixel = 0; pixel < grey.length; pixel += 1) {
    const offset = pixel * 4;
    grey[pixel] = Math.round(
      (png.data[offset]! + png.data[offset + 1]! + png.data[offset + 2]!) / 3,
    );
  }
  const reader = new MultiFormatReader();
  reader.setHints(
    new Map([[DecodeHintType.POSSIBLE_FORMATS, [ZxingFormat.CODE_128]]]),
  );
  assert.equal(
    reader
      .decode(
        new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(grey, png.width, png.height),
          ),
        ),
      )
      .getText(),
    value,
  );
});
test("PDF uses the exact document dimensions and produces both repeated labels", async () => {
  const bytes = await renderLabelPdf(document);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.byteLength > 1000);
  assert.match(Buffer.from(bytes).toString("latin1"), /\/MediaBox\s*\[0 0 141\.7\d* 85\.0\d*\]/);
});
test("PDF encodes one barcode per selected variant at the 5000-label bound", () => {
  const maximum = buildLabelDocument({
    templateName: template.name,
    template: template.config,
    printerProfile: "thermal",
    startCell: 0,
    items: [{ row, quantity: 5_000 }],
    storeName: "Güzide Kuyumcu",
  });
  let encodes = 0;
  const rendered = buildLabelPdfDefinition(maximum, (...args) => {
    encodes += 1;
    return renderBarcodeSvg(...args);
  }) as any;
  assert.equal(encodes, 1);
  assert.equal(rendered.content[0].table.body.length, 5_000);
});
test("A4 PDF preserves start cell, Turkish text and multiple pages", async () => {
  const a4 = getSystemBarcodeLabelTemplate("a4-3x8")!;
  const a4Document = buildLabelDocument({
    templateName: a4.name,
    template: a4.config,
    printerProfile: "a4",
    startCell: 5,
    items: [{ row, quantity: 30 }],
    storeName: "Güzide Kuyumcu",
  });
  assert.deepEqual(a4Document.errors, []);
  const pdfDefinition = buildLabelPdfDefinition(a4Document) as any;
  const cells = pdfDefinition.content[0].table.body.flat();
  assert.equal(cells.slice(0, 5).every((cell: any) => cell.text === ""), true);
  assert.match(JSON.stringify(pdfDefinition), /Türkçe Şık Kolye/u);
  const bytes = Buffer.from(await renderLabelPdf(a4Document));
  assert.ok((bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length >= 2);
  assert.match(bytes.toString("latin1"), /\/MediaBox\s*\[0 0 595\.\d+ 841\.\d+\]/);
});
test("A4 output paginates by the configured rows and columns", () => {
  const source = getSystemBarcodeLabelTemplate("a4-2x7")!;
  const pagedDocument = buildLabelDocument({
    templateName: "A4 2 × 2 test",
    template: {
      ...source.config,
      widthMm: 90,
      heightMm: 30,
      rows: 2,
      columns: 2,
      marginsMm: { top: 2, right: 2, bottom: 2, left: 2 },
      gapMm: { horizontal: 1, vertical: 1 },
    },
    printerProfile: "a4",
    startCell: 1,
    items: [{ row, quantity: 6 }],
    storeName: "Güzide Kuyumcu",
  });
  const pdfDefinition = buildLabelPdfDefinition(pagedDocument) as any;
  assert.equal(pdfDefinition.content.length, 2);
  assert.equal(pdfDefinition.content[0].table.body.flat().length, 4);
  assert.equal(pdfDefinition.content[0].table.body[0][0].text, "");
  assert.equal(pdfDefinition.content[0].pageBreak, "after");
  assert.equal(pdfDefinition.content[1].table.body[0][0].text, undefined);
});
test("ZPL uses the shared document at exact 203 and 300 DPI dimensions", () => {
  const z203 = renderLabelZpl(document, 203);
  const z300 = renderLabelZpl(document, 300);
  assert.match(z203, /\^PW400/);
  assert.match(z203, /\^LL240/);
  assert.match(z300, /\^PW591/);
  assert.match(z300, /\^LL354/);
  assert.equal((z203.match(/\^XA/g) ?? []).length, 2);
  assert.match(z203, /000ABC123/);
  assert.match(z203, /\^FO28,\d+\^BY2\^BC/);
  assert.equal([...z203].every((character) => character.charCodeAt(0) < 128), true);
  assert.match(z203, /TL 8\.950,00/);
});
test("ZPL preserves resolved document text beyond 200 characters", () => {
  const longValue = `${"A".repeat(205)}-TAIL-MARKER`;
  const longDocument = {
    ...document,
    items: document.items.map((item) => ({
      ...item,
      fields: item.fields.map((field, index) =>
        index === 0 ? { ...field, value: longValue } : field,
      ),
    })),
  };
  const zpl = renderLabelZpl(longDocument, 203);
  assert.match(zpl, /-TAIL-MARKER\^FS/);
});
test("ZPL honors asymmetric shared-document margins at both DPIs", () => {
  const asymmetric = {
    ...document,
    template: {
      ...document.template,
      marginsMm: { top: 1, right: 4, bottom: 1, left: 2 },
    },
  };
  assert.match(renderLabelZpl(asymmetric, 203), /\^FO16,8.*\^FB352,/);
  assert.match(renderLabelZpl(asymmetric, 300), /\^FO24,12.*\^FB520,/);
});
test("ZPL preserves safe Code 128 punctuation through field hex and automatic subset mode", () => {
  const exactValue = "00_ABC-12";
  const exactDocument = {
    ...document,
    items: document.items.map((item) => ({
      ...item,
      barcode: { ...item.barcode, value: exactValue },
    })),
  };
  const zpl = renderLabelZpl(exactDocument, 203);
  assert.match(zpl, /N,N,A\^FH_\^FD00_5FABC-12\^FS/);
});
test("ZPL advances by resolved lines rather than configured maximum lines", () => {
  const shortDocument = {
    ...document,
    items: document.items.map((item) => ({
      ...item,
      fields: [
        { ...item.fields[0]!, value: "Kısa", maxLines: 4 },
        item.fields.find(({ key }) => key === "barcodeSymbol")!,
      ],
    })),
  };
  assert.match(renderLabelZpl(shortDocument, 203), /\^FO28,27\^BY2\^BC/);
});
test("EAN-13 ZPL delegates check digit generation without duplicating it", () => {
  const eanDocument = buildLabelDocument({
    templateName: template.name,
    template: { ...template.config, barcodeFormat: "ean13" },
    printerProfile: "thermal",
    startCell: 0,
    items: [{ row: { ...row, barcode: "4006381333931" }, quantity: 1 }],
  });
  const zpl = renderLabelZpl(eanDocument, 203);
  assert.match(zpl, /\^BEN/);
  assert.match(zpl, /\^FD400638133393\^FS/);
  assert.doesNotMatch(zpl, /\^FD4006381333931\^FS/);
});
test("document and persisted job carry identical snapshots", () => {
  assert.equal(
    job.items[0]!.snapshot.barcode,
    document.items[0]!.barcode.value,
  );
  assert.equal(job.labelCount, document.labelCount);
});
