export const BARCODE_LABEL_SORTS = Object.freeze([
  "name-asc",
  "name-desc",
  "updated-desc",
  "sku-asc",
  "barcode-asc",
  "stock-desc",
] as const);
export type BarcodeLabelSort = (typeof BARCODE_LABEL_SORTS)[number];

export const BARCODE_LABEL_STOCK_STATES = Object.freeze([
  "in_stock",
  "out_of_stock",
  "not_tracked",
] as const);
export type BarcodeLabelStockState =
  (typeof BARCODE_LABEL_STOCK_STATES)[number];

export const BARCODE_LABEL_PAGE_SIZES = Object.freeze([20, 50, 100] as const);
export type BarcodeLabelPageSize = (typeof BARCODE_LABEL_PAGE_SIZES)[number];

export interface BarcodeLabelListQuery {
  readonly q?: string;
  readonly status?: "active" | "draft";
  readonly stockState?: BarcodeLabelStockState;
  readonly categoryId?: string;
  readonly brandId?: string;
  readonly productId?: string;
  readonly hasBarcode?: boolean;
  readonly sort: BarcodeLabelSort;
  readonly pageSize: BarcodeLabelPageSize;
}

export interface BarcodeLabelListQueryBinding {
  readonly version: 1;
  readonly q: string | null;
  readonly status: "active" | "draft" | null;
  readonly stockState: BarcodeLabelStockState | null;
  readonly categoryId: string | null;
  readonly brandId: string | null;
  readonly productId: string | null;
  readonly hasBarcode: boolean | null;
  readonly sort: BarcodeLabelSort;
  readonly pageSize: BarcodeLabelPageSize;
}

export type BarcodeFormat = "code128" | "ean13";
export type BarcodeLabelTemplateStatus = "active" | "archived";
export type BarcodePrintOutputType = "browser" | "pdf" | "zpl";
export type BarcodePrinterProfile =
  "a4" | "thermal" | "zebra-203" | "zebra-300";
export type BarcodeLabelSectorProfile =
  "jewelry" | "apparel" | "retail" | "warehouse" | "custom";
export type BarcodeLabelPaperType = "a4" | "thermal-roll" | "custom";
export type BarcodeLabelOrientation = "portrait" | "landscape";
export type BarcodeLabelTextAlign = "left" | "center" | "right";
export type BarcodeLabelCurrencyDisplay = "symbol" | "code" | "none";

export const BARCODE_LABEL_FIELD_KEYS = Object.freeze([
  "storeName",
  "productTitle",
  "variantTitle",
  "sku",
  "barcodeSymbol",
  "barcodeValue",
  "price",
  "compareAtPrice",
  "brand",
  "category",
  "stock",
  "attributes",
] as const);
export type BarcodeLabelFieldKey = (typeof BARCODE_LABEL_FIELD_KEYS)[number];

export interface BarcodeLabelFieldConfig {
  readonly key: BarcodeLabelFieldKey;
  readonly visible: boolean;
  readonly order: number;
  readonly align: BarcodeLabelTextAlign;
  readonly fontSizePt: number;
  readonly maxLines: number;
  readonly autoShrink: boolean;
}

export interface BarcodeLabelTemplateConfig {
  readonly sectorProfile: BarcodeLabelSectorProfile;
  readonly paperType: BarcodeLabelPaperType;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly orientation: BarcodeLabelOrientation;
  readonly rows: number;
  readonly columns: number;
  readonly marginsMm: Readonly<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
  readonly gapMm: Readonly<{ horizontal: number; vertical: number }>;
  readonly barcodeFormat: BarcodeFormat;
  readonly barcodeSource: "barcode" | "sku";
  readonly barcodeHeightMm: number;
  readonly showHumanReadable: boolean;
  readonly currencyDisplay: BarcodeLabelCurrencyDisplay;
  readonly fields: readonly BarcodeLabelFieldConfig[];
}

export interface BarcodeLabelVariantRow {
  readonly productId: string;
  readonly productVersion: number;
  readonly variantId: string;
  readonly variantVersion: number;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly currency: string;
  readonly stock: number;
  readonly trackInventory: boolean;
  readonly category?: Readonly<{ id: string; name: string }>;
  readonly brand?: Readonly<{ id: string; name: string }>;
  readonly attributes: Readonly<Record<string, string>>;
  readonly status: "active" | "draft";
  readonly updatedAt: string;
}

export interface BarcodeLabelListResult {
  readonly items: readonly BarcodeLabelVariantRow[];
  readonly catalogTotal: number;
  readonly storeName: string;
  readonly nextCursor?: string;
}

export interface BarcodeLabelTemplate {
  readonly id: string;
  readonly name: string;
  readonly config: BarcodeLabelTemplateConfig;
  readonly status: BarcodeLabelTemplateStatus;
  readonly isDefault: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type BarcodeLabelTemplateSaveIntent = Readonly<{
  name: string;
  config: BarcodeLabelTemplateConfig;
  makeDefault: boolean;
  templateId?: string;
  expectedVersion?: number;
}>;

export type BarcodeInternalCreateIntent = Readonly<{
  targets: readonly Readonly<{ variantId: string; expectedVersion: number }>[];
}>;

export type BarcodeInternalCreateResult = Readonly<{
  succeeded: readonly Readonly<{
    variantId: string;
    barcode: string;
    version: number;
  }>[];
  failed: readonly Readonly<{
    variantId: string;
    code: "existing_barcode" | "variant_not_found" | "version_conflict";
  }>[];
  replayed: boolean;
}>;

export type BarcodePrintJobCreateIntent = Readonly<{
  template: Readonly<
    | { kind: "system"; key: string }
    | { kind: "custom"; templateId: string; expectedVersion: number }
  >;
  templateConfig: BarcodeLabelTemplateConfig;
  targets: readonly Readonly<{
    variantId: string;
    expectedVersion: number;
    quantity: number;
  }>[];
  outputType: BarcodePrintOutputType;
  printerProfile: BarcodePrinterProfile;
  startCell: number;
}>;

export interface BarcodePrintJobItem {
  readonly variantId: string;
  readonly quantity: number;
  readonly snapshot: BarcodeLabelVariantRow;
}

export interface BarcodePrintJob {
  readonly id: string;
  readonly principalId: string;
  readonly storeName: string;
  readonly templateId?: string;
  readonly templateName: string;
  readonly templateConfig: BarcodeLabelTemplateConfig;
  readonly outputType: BarcodePrintOutputType;
  readonly printerProfile: BarcodePrinterProfile;
  readonly startCell: number;
  readonly variantCount: number;
  readonly labelCount: number;
  readonly status: "prepared";
  readonly items: readonly BarcodePrintJobItem[];
  readonly createdAt: string;
}

export type BarcodePrintJobSummary = Readonly<
  Pick<
    BarcodePrintJob,
    | "id"
    | "templateId"
    | "templateName"
    | "outputType"
    | "printerProfile"
    | "startCell"
    | "variantCount"
    | "labelCount"
    | "status"
    | "createdAt"
  >
>;
