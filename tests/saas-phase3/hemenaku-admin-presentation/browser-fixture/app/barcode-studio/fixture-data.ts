import {
  parseBarcodeLabelListQuery,
  parseBarcodeLabelListResult,
  parseBarcodeLabelTemplate,
  parseBarcodePrintJob,
  parseBarcodePrintJobList,
  type BarcodeLabelListQuery,
  type BarcodeLabelVariantRow,
} from "@celebix/saas-contracts";
import { BRAND_ID, CATEGORY_ID } from "../mira-catalog/catalog-fixture";

// Deterministic local presentation data. These records never call a merchant API.
export const BARCODE_STORE_NAME = "Celebix Atelier · QA";
const NOW = "2026-09-26T11:00:00.000Z";
const uuid = (namespace: string, index: number) =>
  namespace + "-0000-4000-8000-" + String(index).padStart(12, "0");

function ean13(sequence: number) {
  const body = "869100" + String(sequence).padStart(6, "0");
  const checksum = (10 - ([...body].reduce((sum, digit, index) =>
    sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
  return body + checksum;
}

const seeds = [
  { title: "Düşük Bel Denim", variant: "34 / Mavi", sku: "DEN-MV-034", price: 299_000, compare: 349_000, stock: 12, tracked: true, status: "active", attributes: { Beden: "34", Renk: "Mavi" } },
  { title: "Keten Ceket", variant: "M / Taş", sku: "KTN-TAS-M", price: 249_900, compare: 279_900, stock: 8, tracked: true, status: "active", attributes: { Beden: "M", Renk: "Taş" } },
  { title: "Oversize Gömlek", variant: "L / Ekru", sku: "GML-EKR-L", price: 179_900, stock: 0, tracked: true, status: "active", attributes: { Beden: "L", Renk: "Ekru" } },
  { title: "Basic Tişört", variant: "S / Siyah", sku: "TSH-SYH-S", price: 69_900, stock: 24, tracked: true, status: "active", attributes: { Beden: "S", Renk: "Siyah" } },
  { title: "Triko Hırka", variant: "Standart / Kum", sku: "HRK-KUM-STD", price: 189_900, stock: 5, tracked: true, status: "active", attributes: { Beden: "Standart", Renk: "Kum" } },
  { title: "Pamuklu Pantolon", variant: "38 / Haki", sku: "PNT-HKI-038", price: 149_900, stock: 17, tracked: true, status: "active", attributes: { Beden: "38", Renk: "Haki" } },
  { title: "Deri Kemer", variant: "90 cm / Kahve", sku: "KMR-KHV-090", price: 89_900, stock: 0, tracked: false, status: "active", attributes: { Boy: "90 cm", Renk: "Kahve" } },
  { title: "Kanvas Çanta", variant: "Standart / Krem", sku: "CNT-KRM-STD", price: 119_900, stock: 6, tracked: true, status: "draft", attributes: { Renk: "Krem" } },
] as const;

export const BARCODE_ROWS = parseBarcodeLabelListResult({
  storeName: BARCODE_STORE_NAME,
  catalogTotal: seeds.length,
  items: seeds.map((seed, index) => ({
    productId: uuid("95000000", index + 101),
    productVersion: 3,
    variantId: uuid("95000001", index + 201),
    variantVersion: 4,
    productTitle: seed.title,
    variantTitle: seed.variant,
    sku: seed.sku,
    ...(index === 0 ? {} : { barcode: ean13(index + 1) }),
    priceCents: seed.price,
    ...("compare" in seed ? { compareAtCents: seed.compare } : {}),
    currency: "TRY",
    stock: seed.stock,
    trackInventory: seed.tracked,
    category: { id: CATEGORY_ID, name: "Giyim" },
    brand: { id: BRAND_ID, name: "Celebix Atelier" },
    attributes: seed.attributes,
    status: seed.status,
    updatedAt: NOW,
  })),
}).items;

const config = {
  sectorProfile: "retail",
  paperType: "thermal-roll",
  widthMm: 50,
  heightMm: 30,
  orientation: "portrait",
  rows: 1,
  columns: 1,
  marginsMm: { top: 1, right: 1, bottom: 1, left: 1 },
  gapMm: { horizontal: 0, vertical: 0 },
  barcodeFormat: "code128",
  barcodeSource: "barcode",
  barcodeHeightMm: 10,
  showHumanReadable: true,
  currencyDisplay: "symbol",
  fields: [
    { key: "productTitle", visible: true, order: 0, align: "center", fontSizePt: 8, maxLines: 2, autoShrink: true },
    { key: "barcodeSymbol", visible: true, order: 1, align: "center", fontSizePt: 8, maxLines: 1, autoShrink: false },
    { key: "barcodeValue", visible: true, order: 2, align: "center", fontSizePt: 7, maxLines: 1, autoShrink: false },
    { key: "price", visible: true, order: 3, align: "center", fontSizePt: 9, maxLines: 1, autoShrink: true },
  ],
};

export const BARCODE_TEMPLATES = Object.freeze([
  parseBarcodeLabelTemplate({
    id: uuid("95000002", 301),
    name: "Atelier · 50 × 30",
    config,
    status: "active",
    isDefault: false,
    version: 2,
    createdAt: "2026-09-24T11:00:00.000Z",
    updatedAt: NOW,
  }),
  parseBarcodeLabelTemplate({
    id: uuid("95000002", 302),
    name: "Önceki sezon · 50 × 30",
    config,
    status: "archived",
    isDefault: false,
    version: 3,
    createdAt: "2026-09-20T11:00:00.000Z",
    updatedAt: "2026-09-25T11:00:00.000Z",
  }),
]);

export const BARCODE_PRINT_JOBS = Object.freeze([1, 2].map((jobIndex) => {
  const items = BARCODE_ROWS.slice(jobIndex, jobIndex + 2).map((row) => ({
    variantId: row.variantId,
    quantity: jobIndex === 1 ? 2 : 3,
    snapshot: row,
  }));
  return parseBarcodePrintJob({
    id: uuid("95000003", 400 + jobIndex),
    principalId: uuid("95000004", 501),
    storeName: BARCODE_STORE_NAME,
    templateId: BARCODE_TEMPLATES[0]!.id,
    templateName: BARCODE_TEMPLATES[0]!.name,
    templateConfig: BARCODE_TEMPLATES[0]!.config,
    outputType: jobIndex === 1 ? "pdf" : "browser",
    printerProfile: "thermal",
    startCell: 0,
    variantCount: items.length,
    labelCount: items.reduce((sum, item) => sum + item.quantity, 0),
    status: "prepared",
    items,
    createdAt: jobIndex === 1 ? "2026-09-26T10:30:00.000Z" : "2026-09-25T15:20:00.000Z",
  });
}));

export const BARCODE_PRINT_JOB_SUMMARIES = parseBarcodePrintJobList(
  BARCODE_PRINT_JOBS.map(({ items: _items, templateConfig: _config, storeName: _store, principalId: _principal, ...summary }) => summary),
);

function matches(row: BarcodeLabelVariantRow, query: BarcodeLabelListQuery) {
  const q = query.q?.toLocaleLowerCase("tr-TR");
  return (!q || (row.productTitle + " " + row.variantTitle + " " + (row.sku ?? "") + " " + (row.barcode ?? "")).toLocaleLowerCase("tr-TR").includes(q))
    && (!query.status || row.status === query.status)
    && (!query.productId || row.productId === query.productId)
    && (!query.categoryId || row.category?.id === query.categoryId)
    && (!query.brandId || row.brand?.id === query.brandId)
    && (query.hasBarcode === undefined || Boolean(row.barcode) === query.hasBarcode)
    && (!query.stockState
      || (query.stockState === "not_tracked" ? !row.trackInventory
        : row.trackInventory && (query.stockState === "in_stock" ? row.stock > 0 : row.stock === 0)));
}

export function barcodeListResponse(request: Request) {
  const search = new URL(request.url).searchParams;
  const values: Record<string, unknown> = {};
  search.forEach((value, key) => {
    if (key === "cursor") return;
    values[key] = key === "pageSize" ? Number(value)
      : key === "hasBarcode" ? (value === "true" ? true : value === "false" ? false : value)
        : value;
  });
  const query = parseBarcodeLabelListQuery(values);
  const filtered = BARCODE_ROWS.filter((row) => matches(row, query));
  const items = [...filtered].sort((left, right) => {
    if (query.sort === "name-asc") return left.productTitle.localeCompare(right.productTitle, "tr");
    if (query.sort === "name-desc") return right.productTitle.localeCompare(left.productTitle, "tr");
    if (query.sort === "sku-asc") return (left.sku ?? "").localeCompare(right.sku ?? "", "tr");
    if (query.sort === "barcode-asc") return (left.barcode ?? "").localeCompare(right.barcode ?? "", "tr");
    if (query.sort === "stock-desc") return right.stock - left.stock;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
  return parseBarcodeLabelListResult({
    storeName: BARCODE_STORE_NAME,
    catalogTotal: filtered.length,
    items: search.has("cursor") ? [] : items.slice(0, query.pageSize),
  });
}

export function rejectBarcodeFixtureMutation() {
  return Response.json({ code: "fixture_mutation_disabled" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
