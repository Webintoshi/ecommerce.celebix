import {
  BARCODE_LABEL_FIELD_KEYS,
  parseBarcodeLabelTemplateConfig,
  type BarcodeLabelFieldConfig,
  type BarcodeLabelFieldKey,
  type BarcodeLabelTemplateConfig,
} from "@celebix/saas-contracts";

export type SystemBarcodeLabelTemplate = Readonly<{
  key: string;
  name: string;
  config: BarcodeLabelTemplateConfig;
}>;

type FieldEntry = Readonly<{
    key: BarcodeLabelFieldKey;
    visible?: boolean;
    fontSizePt?: number;
    maxLines?: number;
    align?: BarcodeLabelFieldConfig["align"];
    autoShrink?: boolean;
  }>;

function fields(entries: readonly FieldEntry[]): readonly BarcodeLabelFieldConfig[] {
  const completeEntries: readonly FieldEntry[] = [
    ...entries,
    ...BARCODE_LABEL_FIELD_KEYS.filter(
      (key) => !entries.some((entry) => entry.key === key),
    ).map((key) => ({ key, visible: false })),
  ];
  return Object.freeze(
    completeEntries.map((entry, order) =>
      Object.freeze({
        key: entry.key,
        visible: entry.visible ?? true,
        order,
        align: entry.align ?? "center",
        fontSizePt: entry.fontSizePt ?? 8,
        maxLines: entry.maxLines ?? 1,
        autoShrink: entry.autoShrink ?? true,
      }),
    ),
  );
}

const JEWELRY_FIELDS = fields([
  { key: "productTitle", fontSizePt: 6 },
  { key: "variantTitle", fontSizePt: 5, visible: false },
  { key: "sku", fontSizePt: 5, visible: false },
  { key: "barcodeSymbol", fontSizePt: 5, autoShrink: false },
  { key: "barcodeValue", fontSizePt: 5, autoShrink: false, visible: false },
  { key: "price", fontSizePt: 6 },
  { key: "attributes", fontSizePt: 5, maxLines: 2, visible: false },
]);
const APPAREL_FIELDS = fields([
  { key: "productTitle", fontSizePt: 6 },
  { key: "attributes", fontSizePt: 5, maxLines: 2 },
  { key: "sku", fontSizePt: 5 },
  { key: "barcodeSymbol", autoShrink: false },
  { key: "barcodeValue", autoShrink: false, visible: false },
  { key: "price", fontSizePt: 6 },
  { key: "compareAtPrice", fontSizePt: 5 },
]);
const RETAIL_FIELDS = fields([
  { key: "productTitle", fontSizePt: 6 },
  { key: "variantTitle", fontSizePt: 5 },
  { key: "sku", fontSizePt: 5 },
  { key: "barcodeSymbol", autoShrink: false },
  { key: "barcodeValue", autoShrink: false, visible: false },
  { key: "price", fontSizePt: 6 },
]);
const COMPACT_RETAIL_FIELDS = fields([
  { key: "productTitle", fontSizePt: 5, maxLines: 1 },
  { key: "barcodeSymbol", fontSizePt: 5, autoShrink: false },
  { key: "price", fontSizePt: 5 },
]);
const WAREHOUSE_FIELDS = fields([
  { key: "barcodeSymbol", fontSizePt: 10, autoShrink: false },
  { key: "barcodeValue", fontSizePt: 10, autoShrink: false },
  { key: "sku", fontSizePt: 12 },
  { key: "productTitle", fontSizePt: 10, maxLines: 2 },
  { key: "stock", fontSizePt: 11 },
]);

function config(
  input: Readonly<{
    sectorProfile: BarcodeLabelTemplateConfig["sectorProfile"];
    paperType: BarcodeLabelTemplateConfig["paperType"];
    widthMm: number;
    heightMm: number;
    rows?: number;
    columns?: number;
    marginMm?: number;
    gapHorizontalMm?: number;
    gapVerticalMm?: number;
    barcodeHeightMm?: number;
    showHumanReadable?: boolean;
    fields: readonly BarcodeLabelFieldConfig[];
  }>,
): BarcodeLabelTemplateConfig {
  const margin = input.marginMm ?? 1;
  return parseBarcodeLabelTemplateConfig({
    sectorProfile: input.sectorProfile,
    paperType: input.paperType,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    orientation: "portrait",
    rows: input.rows ?? 1,
    columns: input.columns ?? 1,
    marginsMm: { top: margin, right: margin, bottom: margin, left: margin },
    gapMm: {
      horizontal: input.gapHorizontalMm ?? 0,
      vertical: input.gapVerticalMm ?? 0,
    },
    barcodeFormat: "code128",
    barcodeSource: "barcode",
    barcodeHeightMm:
      input.barcodeHeightMm ?? Math.min(12, input.heightMm - margin * 2),
    showHumanReadable: input.showHumanReadable ?? true,
    currencyDisplay: "symbol",
    fields: input.fields,
  });
}

function system(
  key: string,
  name: string,
  template: BarcodeLabelTemplateConfig,
): SystemBarcodeLabelTemplate {
  return Object.freeze({ key, name, config: template });
}

export const SYSTEM_BARCODE_LABEL_TEMPLATES: readonly SystemBarcodeLabelTemplate[] =
  Object.freeze([
    system(
      "jewelry-rat-tail-55x12",
      "Kuyumcu — Kelebek / Rat-tail",
      config({
        sectorProfile: "jewelry",
        paperType: "thermal-roll",
        widthMm: 55.9,
        heightMm: 12.7,
        marginMm: 0.8,
        barcodeHeightMm: 5,
        showHumanReadable: false,
        fields: JEWELRY_FIELDS,
      }),
    ),
    system(
      "apparel-50x30",
      "Giyim",
      config({
        sectorProfile: "apparel",
        paperType: "thermal-roll",
        widthMm: 50,
        heightMm: 30,
        barcodeHeightMm: 7,
        showHumanReadable: false,
        fields: APPAREL_FIELDS,
      }),
    ),
    system(
      "retail-50x30",
      "Genel perakende",
      config({
        sectorProfile: "retail",
        paperType: "thermal-roll",
        widthMm: 50,
        heightMm: 30,
        barcodeHeightMm: 8,
        showHumanReadable: false,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "warehouse-100x50",
      "Depo / Raf",
      config({
        sectorProfile: "warehouse",
        paperType: "thermal-roll",
        widthMm: 100,
        heightMm: 50,
        barcodeHeightMm: 20,
        fields: WAREHOUSE_FIELDS,
      }),
    ),
    system(
      "a4-2x7",
      "A4 — 2 × 7",
      config({
        sectorProfile: "retail",
        paperType: "a4",
        widthMm: 99.1,
        heightMm: 38.1,
        rows: 7,
        columns: 2,
        marginMm: 5,
        gapHorizontalMm: 1.8,
        gapVerticalMm: 1,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "a4-3x8",
      "A4 — 3 × 8",
      config({
        sectorProfile: "retail",
        paperType: "a4",
        widthMm: 63.5,
        heightMm: 33.9,
        rows: 8,
        columns: 3,
        marginMm: 3,
        gapHorizontalMm: 2.5,
        gapVerticalMm: 1,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "a4-4x12",
      "A4 — 4 × 12",
      config({
        sectorProfile: "retail",
        paperType: "a4",
        widthMm: 48.3,
        heightMm: 21.2,
        rows: 12,
        columns: 4,
        marginMm: 2,
        gapHorizontalMm: 1.5,
        gapVerticalMm: 1.5,
        barcodeHeightMm: 5,
        showHumanReadable: false,
        fields: COMPACT_RETAIL_FIELDS,
      }),
    ),
    system(
      "thermal-40x30",
      "Termal rulo — 40 × 30 mm",
      config({
        sectorProfile: "retail",
        paperType: "thermal-roll",
        widthMm: 40,
        heightMm: 30,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "thermal-50x25",
      "Termal rulo — 50 × 25 mm",
      config({
        sectorProfile: "retail",
        paperType: "thermal-roll",
        widthMm: 50,
        heightMm: 25,
        barcodeHeightMm: 9,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "thermal-50x30",
      "Termal rulo — 50 × 30 mm",
      config({
        sectorProfile: "retail",
        paperType: "thermal-roll",
        widthMm: 50,
        heightMm: 30,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "thermal-60x40",
      "Termal rulo — 60 × 40 mm",
      config({
        sectorProfile: "retail",
        paperType: "thermal-roll",
        widthMm: 60,
        heightMm: 40,
        barcodeHeightMm: 16,
        fields: RETAIL_FIELDS,
      }),
    ),
    system(
      "thermal-100x50",
      "Termal rulo — 100 × 50 mm",
      config({
        sectorProfile: "warehouse",
        paperType: "thermal-roll",
        widthMm: 100,
        heightMm: 50,
        barcodeHeightMm: 20,
        fields: WAREHOUSE_FIELDS,
      }),
    ),
  ]);

export function getSystemBarcodeLabelTemplate(
  key: string,
): SystemBarcodeLabelTemplate | undefined {
  return SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    (template) => template.key === key,
  );
}
