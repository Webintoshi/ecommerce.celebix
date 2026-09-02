import assert from "node:assert/strict";
import test from "node:test";

import * as contracts from "../index.ts";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "40000000-0000-4000-8000-000000000001";
const JOB_ID = "50000000-0000-4000-8000-000000000001";
const NOW = "2026-09-02T10:00:00.000Z";

const templateConfig = Object.freeze({
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
    {
      key: "productTitle",
      visible: true,
      order: 0,
      align: "center",
      fontSizePt: 9,
      maxLines: 2,
      autoShrink: true,
    },
    {
      key: "barcodeSymbol",
      visible: true,
      order: 1,
      align: "center",
      fontSizePt: 8,
      maxLines: 1,
      autoShrink: false,
    },
    {
      key: "barcodeValue",
      visible: true,
      order: 2,
      align: "center",
      fontSizePt: 8,
      maxLines: 1,
      autoShrink: false,
    },
    {
      key: "price",
      visible: true,
      order: 3,
      align: "center",
      fontSizePt: 10,
      maxLines: 1,
      autoShrink: true,
    },
  ],
});

const variantRow = Object.freeze({
  productId: PRODUCT_ID,
  productVersion: 3,
  variantId: VARIANT_ID,
  variantVersion: 4,
  productTitle: "14 Ayar Altın Kolye",
  variantTitle: "45 cm",
  sku: "KLY-001",
  barcode: "000123ABC456",
  priceCents: 895000,
  compareAtCents: 999000,
  currency: "TRY",
  stock: 35,
  trackInventory: true,
  category: { id: "60000000-0000-4000-8000-000000000001", name: "Kolyeler" },
  brand: { id: "70000000-0000-4000-8000-000000000001", name: "Atölye" },
  attributes: { Ayar: "14 Ayar", Maden: "Altın", Ağırlık: "2.35 gr" },
  status: "active",
  updatedAt: NOW,
});

test("barcode label contract exports a strict list-query parser", () => {
  assert.equal(
    typeof (contracts as Record<string, unknown>).parseBarcodeLabelListQuery,
    "function",
  );
});

test("barcode label contract exposes every finite projection and intent parser", () => {
  for (const name of [
    "parseBarcodeLabelVariantRow",
    "parseBarcodeLabelListResult",
    "parseBarcodeLabelTemplate",
    "parseBarcodeLabelTemplateSaveIntent",
    "parseBarcodeInternalCreateIntent",
    "parseBarcodeInternalCreateResult",
    "parseBarcodePrintJobCreateIntent",
    "parseBarcodePrintJob",
    "parseBarcodePrintJobList",
  ]) {
    assert.equal(
      typeof (contracts as Record<string, unknown>)[name],
      "function",
      name,
    );
  }
});

test("list query normalizes only global server-side dimensions and binds page size", () => {
  assert.deepEqual(
    contracts.parseBarcodeLabelListQuery({
      q: "  000123  ",
      status: "active",
      stockState: "in_stock",
      categoryId: variantRow.category.id,
      brandId: variantRow.brand.id,
      productId: variantRow.productId,
      hasBarcode: false,
      sort: "stock-desc",
      pageSize: 100,
    }),
    {
      q: "000123",
      status: "active",
      stockState: "in_stock",
      categoryId: variantRow.category.id,
      brandId: variantRow.brand.id,
      productId: variantRow.productId,
      hasBarcode: false,
      sort: "stock-desc",
      pageSize: 100,
    },
  );
  assert.deepEqual(contracts.parseBarcodeLabelListQuery({ q: "   " }), {
    sort: "updated-desc",
    pageSize: 20,
  });
  assert.notEqual(
    contracts.barcodeLabelListQueryDigest({ q: "kolye", pageSize: 20 }),
    contracts.barcodeLabelListQueryDigest({ q: "kolye", pageSize: 50 }),
  );
  for (const invalid of [
    { q: "x\u0000" },
    { q: "x".repeat(201) },
    { status: "archived" },
    { stockState: "yes" },
    { hasBarcode: "true" },
    { pageSize: 500 },
    { sort: "random" },
    { storeId: PRODUCT_ID },
  ])
    assert.throws(() => contracts.parseBarcodeLabelListQuery(invalid));
});

test("variant rows expose exact safe label data and deeply freeze attributes", () => {
  const parsed = contracts.parseBarcodeLabelVariantRow(variantRow);
  assert.deepEqual(parsed, variantRow);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.attributes), true);
  assert.equal(Object.isFrozen(parsed.category), true);
  assert.throws(() =>
    contracts.parseBarcodeLabelVariantRow({ ...variantRow, costCents: 1 }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelVariantRow({ ...variantRow, currency: "try" }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelVariantRow({ ...variantRow, compareAtCents: 1 }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelVariantRow({
      ...variantRow,
      attributes: { unsafe: " x" },
    }),
  );
});

test("list result is bounded exact and rejects duplicate variants", () => {
  const parsed = contracts.parseBarcodeLabelListResult({
    items: [variantRow],
    catalogTotal: 1601,
    storeName: "Güzide Kuyumcu",
    nextCursor: "Abc_123",
  });
  assert.deepEqual(parsed.items, [variantRow]);
  assert.equal(parsed.catalogTotal, 1601);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.throws(() =>
    contracts.parseBarcodeLabelListResult({
      items: [variantRow, variantRow],
      catalogTotal: 2,
      storeName: "Güzide Kuyumcu",
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelListResult({
      items: [variantRow],
      catalogTotal: 0,
      storeName: "Güzide Kuyumcu",
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelListResult({
      items: [variantRow],
      catalogTotal: 1,
      storeName: "Güzide Kuyumcu",
      nextCursor: "bad=",
    }),
  );
});

test("template parser enforces finite measured layout and ordered unique fields", () => {
  const template = {
    id: TEMPLATE_ID,
    name: "Genel mağaza etiketi",
    config: templateConfig,
    status: "active",
    isDefault: true,
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const parsed = contracts.parseBarcodeLabelTemplate(template);
  assert.deepEqual(parsed, template);
  assert.equal(Object.isFrozen(parsed.config.fields), true);
  assert.equal(Object.isFrozen(parsed.config.marginsMm), true);
  assert.equal(parsed.config.barcodeSource, "barcode");
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplateConfig({
      ...templateConfig,
      barcodeSource: "product-id",
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplate({
      ...template,
      config: { ...templateConfig, widthMm: 0 },
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplate({
      ...template,
      config: { ...templateConfig, barcodeHeightMm: 29 },
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplateConfig({
      ...templateConfig,
      paperType: "a4",
      widthMm: 100,
      heightMm: 100,
      rows: 3,
      columns: 3,
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplate({
      ...template,
      config: {
        ...templateConfig,
        fields: [...templateConfig.fields, templateConfig.fields[0]],
      },
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplate({
      ...template,
      config: {
        ...templateConfig,
        fields: templateConfig.fields.map((field) => ({ ...field, order: 2 })),
      },
    }),
  );
});

test("template save intent pairs identity and version without browser authority", () => {
  assert.deepEqual(
    contracts.parseBarcodeLabelTemplateSaveIntent({
      name: "Yeni şablon",
      config: templateConfig,
      makeDefault: false,
    }),
    { name: "Yeni şablon", config: templateConfig, makeDefault: false },
  );
  assert.deepEqual(
    contracts.parseBarcodeLabelTemplateSaveIntent({
      templateId: TEMPLATE_ID,
      expectedVersion: 2,
      name: "Yeni şablon",
      config: templateConfig,
      makeDefault: true,
    }).templateId,
    TEMPLATE_ID,
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplateSaveIntent({
      templateId: TEMPLATE_ID,
      name: "Eksik",
      config: templateConfig,
      makeDefault: false,
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplateSaveIntent({
      name: "Yetki",
      config: templateConfig,
      makeDefault: false,
      storeId: PRODUCT_ID,
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodeLabelTemplateSaveIntent({
      name: "Etkisiz termal ızgara",
      config: { ...templateConfig, rows: 2, columns: 2 },
      makeDefault: false,
    }),
  );
});

test("internal barcode intent is unique versioned and result never fabricates GTIN semantics", () => {
  assert.deepEqual(
    contracts.parseBarcodeInternalCreateIntent({
      targets: [{ variantId: VARIANT_ID, expectedVersion: 4 }],
    }),
    {
      targets: [{ variantId: VARIANT_ID, expectedVersion: 4 }],
    },
  );
  assert.throws(() =>
    contracts.parseBarcodeInternalCreateIntent({ targets: [] }),
  );
  assert.throws(() =>
    contracts.parseBarcodeInternalCreateIntent({
      targets: [
        { variantId: VARIANT_ID, expectedVersion: 4 },
        { variantId: VARIANT_ID, expectedVersion: 4 },
      ],
    }),
  );
  const result = contracts.parseBarcodeInternalCreateResult({
    succeeded: [
      { variantId: VARIANT_ID, barcode: "CXI-000123ABC", version: 5 },
    ],
    failed: [
      {
        variantId: "20000000-0000-4000-8000-000000000002",
        code: "existing_barcode",
      },
    ],
    replayed: false,
  });
  assert.equal(result.succeeded[0]?.barcode.startsWith("CXI-"), true);
  assert.throws(() =>
    contracts.parseBarcodeInternalCreateResult({
      ...result,
      succeeded: [
        { variantId: VARIANT_ID, barcode: "8691234567890", version: 5 },
      ],
    }),
  );
});

test("print intent accepts only positive bounded quantities and finite outputs", () => {
  const intent = {
    template: { kind: "system", key: "retail-50x30" },
    templateConfig: {
      ...templateConfig,
      paperType: "a4",
      widthMm: 63.5,
      heightMm: 33.9,
      rows: 8,
      columns: 3,
    },
    targets: [{ variantId: VARIANT_ID, expectedVersion: 4, quantity: 3 }],
    outputType: "pdf",
    printerProfile: "a4",
    startCell: 5,
  };
  assert.deepEqual(contracts.parseBarcodePrintJobCreateIntent(intent), intent);
  assert.throws(() =>
    contracts.parseBarcodePrintJobCreateIntent({
      ...intent,
      targets: [{ ...intent.targets[0], quantity: 0 }],
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodePrintJobCreateIntent({
      ...intent,
      targets: [{ ...intent.targets[0], quantity: 1.5 }],
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodePrintJobCreateIntent({
      ...intent,
      outputType: "printed",
    }),
  );
  assert.throws(() =>
    contracts.parseBarcodePrintJobCreateIntent({
      ...intent,
      storeId: PRODUCT_ID,
    }),
  );
});

test("print job keeps one server snapshot with exact quantity arithmetic", () => {
  const job = {
    id: JOB_ID,
    principalId: PRINCIPAL_ID,
    storeName: "Güzide Kuyumcu",
    templateId: TEMPLATE_ID,
    templateName: "Genel mağaza etiketi",
    templateConfig,
    outputType: "pdf",
    printerProfile: "a4",
    startCell: 5,
    variantCount: 1,
    labelCount: 3,
    status: "prepared",
    items: [{ variantId: VARIANT_ID, quantity: 3, snapshot: variantRow }],
    createdAt: NOW,
  };
  const parsed = contracts.parseBarcodePrintJob(job);
  assert.deepEqual(parsed, job);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]?.snapshot), true);
  assert.throws(() =>
    contracts.parseBarcodePrintJob({ ...job, labelCount: 2 }),
  );
  assert.throws(() =>
    contracts.parseBarcodePrintJob({ ...job, variantCount: 2 }),
  );
  const {
    principalId: _principalId,
    storeName: _storeName,
    templateConfig: _templateConfig,
    items: _items,
    ...summary
  } = job;
  assert.deepEqual(contracts.parseBarcodePrintJobList([summary]), [summary]);
  assert.throws(() => contracts.parseBarcodePrintJobList([job]));
});
