import pdfMake from "pdfmake/build/pdfmake.js";
import fontVfs from "pdfmake/build/vfs_fonts.js";
import type { LabelDocument, LabelDocumentItem } from "./document.ts";
import { renderBarcodeSvg } from "./render-barcode.ts";
import { paginateLabelDocument } from "./pages.ts";

const pt = (mm: number) => (mm * 72) / 25.4;
pdfMake.vfs = fontVfs;
pdfMake.fonts = {
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};

type BarcodeRenderer = typeof renderBarcodeSvg;
type PdfCell = {
  text?: string;
  stack?: Array<Record<string, unknown>>;
  border: boolean[];
  margin: number | number[];
};
function cell(
  item: LabelDocumentItem | undefined,
  document: LabelDocument,
  barcodeRenderer: BarcodeRenderer,
): PdfCell {
  if (!item)
    return { text: "", border: [false, false, false, false], margin: 0 };
  const visible = item.fields.map((field) =>
    field.key === "barcodeSymbol"
      ? {
          svg: barcodeRenderer(
            item.barcode.format,
            item.barcode.value,
            item.barcode.heightMm,
            item.barcode.showHumanReadable,
          ),
          fit: [
            pt(
              document.template.widthMm -
                document.template.marginsMm.left -
                document.template.marginsMm.right,
            ),
            pt(
              item.barcode.heightMm +
                (item.barcode.showHumanReadable ? 3 : 0),
            ),
          ],
          alignment: "center",
        }
      : {
          text: field.value,
          fontSize: field.fontSizePt,
          alignment: field.align,
          bold: field.key === "productTitle" || field.key === "price",
          noWrap: field.maxLines === 1,
          margin: [0, 0, 0, 1],
        },
  );
  return {
    stack: visible,
    border: [false, false, false, false],
    margin: [
      pt(document.template.marginsMm.left),
      pt(document.template.marginsMm.top),
      pt(document.template.marginsMm.right),
      pt(document.template.marginsMm.bottom),
    ],
  };
}
function cloneCell(value: ReturnType<typeof cell>) {
  if (!value.stack) return { ...value, border: [...value.border] };
  return {
    ...value,
    stack: value.stack.map((entry) => ({
      ...entry,
      ...(Array.isArray(entry.fit) ? { fit: [...entry.fit] } : {}),
      ...(Array.isArray(entry.margin) ? { margin: [...entry.margin] } : {}),
    })),
    margin: Array.isArray(value.margin) ? [...value.margin] : value.margin,
    border: [...value.border],
  };
}
function definition(
  document: LabelDocument,
  barcodeRenderer: BarcodeRenderer = renderBarcodeSvg,
) {
  const resolvedCells = new Map(
    document.items.map((item) => [
      item,
      cell(item, document, barcodeRenderer),
    ]),
  );
  const isA4 = document.template.paperType === "a4";
  const columns = isA4 ? document.template.columns : 1;
  const pages = paginateLabelDocument(document);
  return {
    pageSize: isA4
      ? "A4"
      : {
          width: pt(document.template.widthMm),
          height: pt(document.template.heightMm),
        },
    ...(isA4 ? { pageOrientation: document.template.orientation } : {}),
    pageMargins: isA4 ? [pt(4), pt(4), pt(4), pt(4)] : [0, 0, 0, 0],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content: pages.map((page, pageIndex) => {
      const cells = page.map((item) =>
        item
          ? cloneCell(resolvedCells.get(item)!)
          : cell(undefined, document, barcodeRenderer),
      );
      while (cells.length % columns !== 0)
        cells.push(cell(undefined, document, barcodeRenderer));
      const rows: Array<unknown[]> = [];
      for (let index = 0; index < cells.length; index += columns)
        rows.push(cells.slice(index, index + columns));
      return {
        table: {
          widths: Array.from({ length: columns }, () =>
            pt(document.template.widthMm),
          ),
          heights: () => pt(document.template.heightMm),
          body: rows,
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => pt(document.template.gapMm.horizontal),
          paddingTop: () => 0,
          paddingBottom: () => pt(document.template.gapMm.vertical),
        },
        ...(pageIndex < pages.length - 1 ? { pageBreak: "after" } : {}),
      };
    }),
    info: {
      title: document.templateName,
      subject: "Celebix Barkod ve Etiket Merkezi",
      creator: "Celebix",
    },
  };
}
export const buildLabelPdfDefinition = definition;
export async function renderLabelPdf(
  document: LabelDocument,
): Promise<Uint8Array> {
  if (document.errors.length > 0 || document.labelCount < 1)
    throw new TypeError("label_document_blocked");
  return new Promise((resolve, reject) => {
    try {
      pdfMake
        .createPdf(definition(document))
        .getBuffer((buffer) => resolve(new Uint8Array(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
