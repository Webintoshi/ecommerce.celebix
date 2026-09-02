import assert from "node:assert/strict";
import test from "node:test";

import {
  barcodeFitsLabel,
  validateBarcodeValue,
  validateEan13,
} from "./barcodes.ts";
import { buildLabelDocument } from "./document.ts";
import { SYSTEM_BARCODE_LABEL_TEMPLATES } from "./system-templates.ts";
import { BARCODE_LABEL_FIELD_KEYS } from "@celebix/saas-contracts";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-09-02T10:00:00.000Z";

const row = Object.freeze({
  productId: PRODUCT_ID,
  productVersion: 2,
  variantId: VARIANT_ID,
  variantVersion: 3,
  productTitle: "14 Ayar Altın Kolye",
  variantTitle: "45 cm",
  sku: "KLY-001",
  barcode: "000123ABC456",
  priceCents: 895000,
  compareAtCents: 999000,
  currency: "TRY",
  stock: 35,
  trackInventory: true,
  category: { id: "30000000-0000-4000-8000-000000000001", name: "Kolyeler" },
  brand: { id: "40000000-0000-4000-8000-000000000001", name: "Atölye" },
  attributes: { ayar: "14 Ayar", maden: "Altın", agirlik: "2.35 gr", bos: "" },
  status: "active" as const,
  updatedAt: NOW,
});

test("barcode document core and system template registry are available", async () => {
  const documentModule = await import("./document.ts").catch(() => null);
  const templateModule = await import("./system-templates.ts").catch(
    () => null,
  );
  const barcodeModule = await import("./barcodes.ts").catch(() => null);
  assert.equal(typeof documentModule?.buildLabelDocument, "function");
  assert.equal(
    Array.isArray(templateModule?.SYSTEM_BARCODE_LABEL_TEMPLATES),
    true,
  );
  assert.equal(typeof barcodeModule?.validateEan13, "function");
  assert.equal(typeof barcodeModule?.validateBarcodeValue, "function");
  assert.equal(typeof barcodeModule?.barcodeFitsLabel, "function");
});

test("system registry exposes every approved generic sector and paper profile", () => {
  assert.deepEqual(
    SYSTEM_BARCODE_LABEL_TEMPLATES.map(({ key }) => key),
    [
      "jewelry-rat-tail-55x12",
      "apparel-50x30",
      "retail-50x30",
      "warehouse-100x50",
      "a4-2x7",
      "a4-3x8",
      "a4-4x12",
      "thermal-40x30",
      "thermal-50x25",
      "thermal-50x30",
      "thermal-60x40",
      "thermal-100x50",
    ],
  );
  const jewelry = SYSTEM_BARCODE_LABEL_TEMPLATES[0]!;
  assert.deepEqual(
    [jewelry.config.widthMm, jewelry.config.heightMm],
    [55.9, 12.7],
  );
  assert.equal(jewelry.config.sectorProfile, "jewelry");
  for (const template of SYSTEM_BARCODE_LABEL_TEMPLATES)
    assert.deepEqual(
      template.config.fields.map(({ key }) => key).sort(),
      [...BARCODE_LABEL_FIELD_KEYS].sort(),
      template.key,
    );
  assert.equal(
    jewelry.config.fields.find(({ key }) => key === "compareAtPrice")?.visible,
    false,
  );
  assert.equal(Object.isFrozen(jewelry.config.fields), true);
  assert.deepEqual(
    buildLabelDocument({
      templateName: jewelry.name,
      template: jewelry.config,
      printerProfile: "thermal",
      startCell: 0,
      items: [{ row, quantity: 1 }],
    }).errors,
    [],
  );
});

test("every required system template produces an unblocked representative document", () => {
  for (const template of SYSTEM_BARCODE_LABEL_TEMPLATES) {
    const document = buildLabelDocument({
      templateName: template.name,
      template: template.config,
      printerProfile: template.config.paperType === "a4" ? "a4" : "thermal",
      startCell: 0,
      items: [{ row, quantity: 1 }],
      storeName: "Güzide Kuyumcu",
    });
    assert.deepEqual(document.errors, [], template.key);
  }
});

test("apparel and retail ready templates resolve every required default field", () => {
  const apparel = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "apparel-50x30",
  )!;
  const apparelDocument = buildLabelDocument({
    templateName: apparel.name,
    template: apparel.config,
    printerProfile: "thermal",
    startCell: 0,
    items: [
      {
        row: { ...row, attributes: { Beden: "M", Renk: "Siyah" } },
        quantity: 1,
      },
    ],
  });
  const apparelValues = apparelDocument.items[0]!.fields.map(
    ({ key, value }) => [key, value] as const,
  );
  assert.equal(apparelValues.some(([key]) => key === "sku"), true);
  assert.equal(apparelValues.some(([key]) => key === "compareAtPrice"), true);
  assert.equal(
    apparelValues.some(
      ([key, value]) =>
        key === "attributes" && value.includes("M") && value.includes("Siyah"),
    ),
    true,
  );
  assert.deepEqual(apparelDocument.errors, []);

  const retail = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "retail-50x30",
  )!;
  const retailDocument = buildLabelDocument({
    templateName: retail.name,
    template: retail.config,
    printerProfile: "thermal",
    startCell: 0,
    items: [{ row, quantity: 1 }],
  });
  const retailKeys = retailDocument.items[0]!.fields.map(({ key }) => key);
  assert.equal(retailKeys.includes("variantTitle"), true);
  assert.equal(retailKeys.includes("sku"), true);
  assert.deepEqual(retailDocument.errors, []);
});

test("Code 128 preserves leading zeroes and EAN-13 verifies its check digit", () => {
  assert.deepEqual(validateBarcodeValue("code128", "000123ABC456"), {
    valid: true,
  });
  assert.deepEqual(validateBarcodeValue("code128", "ABC\u0000"), {
    valid: false,
    code: "code128_invalid",
  });
  for (const reserved of ["ABC^123", "ABC~123", "ABC\\123", "ABC>123"])
    assert.equal(validateBarcodeValue("code128", reserved).valid, false);
  assert.equal(validateEan13("4006381333931"), true);
  assert.equal(validateEan13("4006381333932"), false);
  assert.deepEqual(validateBarcodeValue("ean13", "4006381333932"), {
    valid: false,
    code: "ean13_checksum",
  });
  assert.deepEqual(validateBarcodeValue("ean13", "400638133393"), {
    valid: false,
    code: "ean13_length",
  });
  assert.deepEqual(validateBarcodeValue("code128", undefined), {
    valid: false,
    code: "barcode_missing",
  });
});

test("barcode quiet zones and module widths must fit the measured label", () => {
  assert.equal(
    barcodeFitsLabel({
      format: "code128",
      value: "000123ABC456",
      availableWidthMm: 48,
    }),
    true,
  );
  assert.equal(
    barcodeFitsLabel({
      format: "code128",
      value: "000123ABC456",
      availableWidthMm: 20,
    }),
    false,
  );
  assert.equal(
    barcodeFitsLabel({
      format: "ean13",
      value: "4006381333931",
      availableWidthMm: 32,
    }),
    true,
  );
  assert.equal(
    barcodeFitsLabel({
      format: "ean13",
      value: "4006381333931",
      availableWidthMm: 20,
    }),
    false,
  );
});

test("Zebra profiles reject EAN labels that cannot meet DPI module width", () => {
  const template = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "thermal-40x30",
  )!;
  for (const printerProfile of ["zebra-203", "zebra-300"] as const) {
    const selected = buildLabelDocument({
      templateName: template.name,
      template: { ...template.config, barcodeFormat: "ean13" },
      printerProfile,
      startCell: 0,
      items: [
        { row: { ...row, barcode: "4006381333931" }, quantity: 1 },
      ],
    });
    assert.equal(
      selected.errors.some(({ code }) => code === "barcode_overflow"),
      true,
    );
  }
});

test("compact internal identifier fits retail and jewelry templates", () => {
  for (const key of ["retail-50x30", "jewelry-rat-tail-55x12"] as const) {
    const template = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
      (entry) => entry.key === key,
    )!;
    const selected = buildLabelDocument({
      templateName: template.name,
      template: template.config,
      printerProfile: "thermal",
      startCell: 0,
      items: [
        { row: { ...row, barcode: "CXI-000000000123" }, quantity: 1 },
      ],
    });
    assert.equal(
      selected.errors.some(({ code }) => code === "barcode_overflow"),
      false,
    );
  }
});

test("one normalized jewelry document drives quantities fields price and attributes", () => {
  const template = SYSTEM_BARCODE_LABEL_TEMPLATES[0]!;
  const document = buildLabelDocument({
    templateName: template.name,
    template: {
      ...template.config,
      heightMm: 25,
      fields: template.config.fields.map((field) =>
        field.key === "attributes" ? { ...field, visible: true } : field,
      ),
    },
    printerProfile: "thermal",
    startCell: 0,
    storeName: "Güzide Kuyumcu",
    items: [
      {
        row: {
          ...row,
          attributes: {
            AYAR: "14 Ayar",
            MADEN: "Altın",
            AĞIRLIK: "2.35 gr",
          },
        },
        quantity: 3,
      },
    ],
  });
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.variantCount, 1);
  assert.equal(document.labelCount, 3);
  assert.equal(document.items[0]?.barcode.value, "000123ABC456");
  assert.equal(document.items[0]?.barcode.quietZoneModules, 10);
  assert.equal(
    document.items[0]?.fields.some(({ value }) => value === "₺8.950,00"),
    true,
  );
  assert.equal(
    document.items[0]?.fields.some(({ value }) =>
      value.includes("Ayar: 14 Ayar"),
    ),
    true,
  );
  assert.equal(
    document.items[0]?.fields.some(({ value }) => value.includes("bos")),
    false,
  );
  assert.equal(Object.isFrozen(document.items), true);
  assert.equal(Object.isFrozen(document.items[0]?.source.attributes), true);
  assert.deepEqual(document.errors, []);
});

test("zero quantities are excluded while negative fractional and excessive totals fail", () => {
  const template = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "retail-50x30",
  )!;
  assert.throws(() =>
    buildLabelDocument({
      templateName: template.name,
      template: template.config,
      printerProfile: "thermal",
      startCell: 0,
      items: [{ row, quantity: -1 }],
    }),
  );
  assert.throws(() =>
    buildLabelDocument({
      templateName: template.name,
      template: template.config,
      printerProfile: "thermal",
      startCell: 0,
      items: [{ row, quantity: 1.5 }],
    }),
  );
  const empty = buildLabelDocument({
    templateName: template.name,
    template: template.config,
    printerProfile: "thermal",
    startCell: 0,
    items: [{ row, quantity: 0 }],
  });
  assert.equal(empty.labelCount, 0);
  assert.deepEqual(empty.items, []);
});

test("invalid EAN and content overflow are explicit blocking document errors", () => {
  const template = SYSTEM_BARCODE_LABEL_TEMPLATES[0]!;
  const eanDocument = buildLabelDocument({
    templateName: template.name,
    template: { ...template.config, barcodeFormat: "ean13" },
    printerProfile: "thermal",
    startCell: 0,
    items: [{ row: { ...row, barcode: "4006381333932" }, quantity: 1 }],
  });
  assert.deepEqual(
    eanDocument.errors.map(({ code }) => code),
    ["ean13_checksum"],
  );
  const overflow = buildLabelDocument({
    templateName: template.name,
    template: {
      ...template.config,
      fields: template.config.fields.map((field) =>
        field.key === "productTitle"
          ? { ...field, autoShrink: false }
          : field,
      ),
    },
    printerProfile: "thermal",
    startCell: 0,
    items: [
      {
        row: {
          ...row,
          productTitle: "Çok Uzun Türkçe Ürün Adı ".repeat(8).trim(),
        },
        quantity: 1,
      },
    ],
  });
  assert.equal(
    overflow.errors.some(({ code }) => code === "text_overflow"),
    true,
  );
});

test("apparel template resolves generic size and color aliases without hardcoded IDs", () => {
  const template = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "apparel-50x30",
  )!;
  const document = buildLabelDocument({
    templateName: template.name,
    template: template.config,
    printerProfile: "thermal",
    startCell: 0,
    items: [
      {
        row: { ...row, attributes: { SIZE: "M", RENK: "Siyah" } },
        quantity: 1,
      },
    ],
  });
  const values = document.items[0]!.fields.map(({ value }) => value).join(
    " | ",
  );
  assert.match(values, /Beden: M/u);
  assert.match(values, /Renk: Siyah/u);
});

test("shared document rejects paper profile drift and an out-of-grid start cell", () => {
  const thermal = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "retail-50x30",
  )!;
  assert.throws(() =>
    buildLabelDocument({
      templateName: thermal.name,
      template: thermal.config,
      printerProfile: "a4",
      startCell: 0,
      items: [{ row, quantity: 1 }],
    }),
  );
  const a4 = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
    ({ key }) => key === "a4-2x7",
  )!;
  assert.throws(() =>
    buildLabelDocument({
      templateName: a4.name,
      template: a4.config,
      printerProfile: "a4",
      startCell: a4.config.rows * a4.config.columns,
      items: [{ row, quantity: 1 }],
    }),
  );
});
