import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseProductVariant } from "@celebix/saas-contracts";
import { compileQukasoftMigration } from "./qukasoft-migration.ts";

function product(overrides: Readonly<Record<string, string>> = {}, nested = ""): string {
  const fields = {
    id: "3481", productCode: "YZK 98", barcode: "100000000637", modelCode: "",
    main_category: "Yüzükler", top_category: "Taşlı Yüzükler", sub_category: "",
    categoryID: "57", category: "Yüzükler >>> Taşlı Yüzükler", active: "1",
    brandID: "1", brand: "Güzide Kuyumcu", name: "14 Ayar Altın Taşlı Yüzük 98",
    description: "Kısa açıklama", image1: "https://cdn.qukasoft.com/front.webp",
    image2: "https://cdn.qukasoft.com/side.webp", specCode1: "", listPrice: "15000.29",
    price: "14000.01", tax: "0.18", currency: "TRY", desi: "1", quantity: "2",
    domestic: "0", show_home: "1", in_discount: "1", unit: "Adet",
    link: "https://store.myqukasoft.com/yuzuk-98",
    detail: "<p>Ger&ccedil;ek altın ve 2.12&nbsp; gramdır.</p>", ...overrides,
  };
  return `<product>${Object.entries(fields).map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`).join("")}${nested}</product>`;
}

function xml(...products: readonly string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><products>${products.join("")}</products>`;
}

function variant(value: string, quantity: string, barcode: string, price?: string, name = "HARF"): string {
  return `<variant><name1>${name}</name1><value1>${value}</value1><name2/><value2/><quantity>${quantity}</quantity><barcode>${barcode}</barcode>${price === undefined ? "" : `<price>${price}</price>`}</variant>`;
}

test("preserves the entire Qukasoft source while compiling exact prices, rich description and measured grams", async () => {
  const row = product({ futureField: "kept", image3: "https://cdn.qukasoft.com/front.webp" }, "<attributes><attribute><name>Maden</name><value>14 Ayar Altın</value></attribute></attributes>");
  const source = xml(row);
  const manifest = await compileQukasoftMigration(source);
  const selected = manifest.products[0]!;
  assert.equal(manifest.sourceDigest, createHash("sha256").update(source).digest("hex"));
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(selected.sourceMetadata.fields), true);
  assert.equal(selected.sourceMetadata.rawXml, row);
  assert.equal(selected.sourceMetadata.provider, "qukasoft");
  assert.equal(selected.sourceMetadata.fields.modelCode, "");
  assert.equal(selected.sourceMetadata.fields.futureField, "kept");
  assert.equal(selected.sourceMetadata.fields.detail, "<p>Ger&ccedil;ek altın ve 2.12&nbsp; gramdır.</p>");
  assert.equal(selected.sourceMetadata.fields.currency, "TRY");
  assert.equal(selected.sourceMetadata.fields.show_home, "1");
  assert.deepEqual(selected.sourceMetadata.attributes, [{ name: "Maden", value: "14 Ayar Altın" }]);
  assert.deepEqual(selected.sourceMetadata.weightCandidates, ["2.12"]);
  assert.equal(selected.description, "Gerçek altın ve 2.12 gramdır.");
  assert.equal(selected.status, "active");
  assert.deepEqual(selected.variants, [{
    title: "Varsayılan", sku: "YZK-98", barcode: "100000000637", priceCents: 1_400_001,
    compareAtCents: 1_500_029, stockQuantity: 2,
    attributes: { maden: "14 Ayar Altın", birim: "Adet", kdv_orani: "0.18", "Ağırlık (g)": "2.12" },
    measurements: { weight: { valueMilli: 2120, unit: "g" } },
  }]);
  assert.deepEqual(selected.sourceImages, ["https://cdn.qukasoft.com/front.webp", "https://cdn.qukasoft.com/side.webp"]);
  assert.deepEqual(selected.categorySlugs, ["tasli-yuzukler"]);
  assert.deepEqual(manifest.categories, [{ name: "Yüzükler", slug: "yuzukler" }, { name: "Taşlı Yüzükler", slug: "tasli-yuzukler", parentSlug: "yuzukler" }]);
  assert.deepEqual(manifest.brands, [{ name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" }]);
  assert.deepEqual(manifest.batches, [["3481"]]);
  assert.equal(manifest.mediaCount, 2);
  assert.equal(manifest.warningCounts.duplicateImagesRemoved, 1);
});

test("keeps incomplete and duplicate child rows in metadata without inventing their sale values", async () => {
  const incomplete = variant("Ö", "", "");
  const complete = variant("A", "1", "6520052581127", "10140.29");
  const source = xml(product({}, `<variants>${complete}${incomplete}${complete}</variants>`));
  const manifest = await compileQukasoftMigration(source);
  const selected = manifest.products[0]!;
  assert.equal(selected.variants.length, 1);
  assert.equal(selected.variants[0]?.title, "A");
  assert.equal(selected.variants[0]?.sku, "YZK-98-A");
  assert.equal(selected.variants[0]?.priceCents, 1_014_029);
  assert.equal(selected.variants[0]?.stockQuantity, 1);
  assert.equal(selected.sourceMetadata.variants.length, 3);
  assert.deepEqual(selected.sourceMetadata.variants[1], { name1: "HARF", value1: "Ö", name2: "", value2: "", quantity: "", barcode: "" });
  assert.equal(Object.hasOwn(selected.sourceMetadata.variants[1]!, "price"), false);
  assert.deepEqual(selected.sourceMetadata.issues, [
    { code: "incomplete_variant", sourceVariantIndex: 1, values: ["quantity", "barcode", "price"] },
    { code: "duplicate_variant", sourceVariantIndex: 2 },
  ]);
  assert.equal(manifest.warningCounts.incompleteVariants, 1);
  assert.equal(manifest.warningCounts.duplicateVariants, 1);
});

test("gives colliding Turkish child choices distinct deterministic SKUs and applies explicit Gram measurements", async () => {
  const source = xml(product({}, `<variants>${variant("I", "1", "6520052354905", "9960.00")}${variant("İ", "2", "6520052354906", "9961.00")}${variant("1,29", "3", "6520052418966", "7740.00", "Gram")}</variants>`));
  const manifest = await compileQukasoftMigration(source);
  assert.deepEqual(manifest.products[0]?.variants.map(({ sku }) => sku), ["YZK-98-I", "YZK-98-I-2", "YZK-98-1.29"]);
  assert.deepEqual(manifest.products[0]?.variants[2]?.measurements, { weight: { valueMilli: 1290, unit: "g" } });
  assert.equal(manifest.products[0]?.variants[2]?.attributes["Ağırlık (g)"], "1.29");
});

test("reports multiple gram values and conflicting attributes without choosing a metal or weight", async () => {
  const manifest = await compileQukasoftMigration(xml(product({ detail: "<p>6.26 gram altın ve 1.75 gram çeyrek.</p>" }, "<attributes><attribute><name>Maden</name><value>22 Ayar Altın</value></attribute><attribute><name>Maden</name><value>14 Ayar Altın</value></attribute></attributes>")));
  const selected = manifest.products[0]!;
  assert.deepEqual(selected.sourceMetadata.weightCandidates, ["6.26", "1.75"]);
  assert.equal(selected.variants[0]?.measurements, undefined);
  assert.equal(selected.variants[0]?.attributes["Ağırlık (g)"], undefined);
  assert.equal(selected.variants[0]?.attributes.maden, "22 Ayar Altın / 14 Ayar Altın");
  assert.deepEqual(selected.sourceMetadata.issues, [
    { code: "conflicting_attribute", field: "Maden", values: ["22 Ayar Altın", "14 Ayar Altın"] },
    { code: "ambiguous_weight", values: ["6.26", "1.75"] },
  ]);
  assert.equal(manifest.warningCounts.ambiguousWeight, 1);
  assert.equal(manifest.warningCounts.conflictingAttributes, 1);
});

test("maps length choices independently of ambiguous grams and normalizes repeated equal weights", async () => {
  const manifest = await compileQukasoftMigration(xml(
    product({ detail: "54 CM - 3.15 GRAM<br>44 CM - 2.65 GRAM" }, `<variants>${variant("54 CM", "5", "6520052861960", "18300.00", "Uzunluk")}</variants>`),
    product({ id: "3490", productCode: "YZK 99", barcode: "100000000638", name: "Yüzük 99", detail: "2.190 gram ve 2,19 gram", image1: "", image2: "" }),
  ));
  assert.deepEqual(manifest.products[0]?.variants[0]?.measurements, { length: { valueMilli: 54000, unit: "cm" } });
  assert.deepEqual(manifest.products[1]?.sourceMetadata.weightCandidates, ["2.19"]);
  assert.deepEqual(manifest.products[1]?.variants[0]?.measurements, { weight: { valueMilli: 2190, unit: "g" } });
  assert.equal(manifest.warningCounts.missingImage, 1);
});

test("keeps equal category leaves distinct across parents and joins case-only brand spellings", async () => {
  const manifest = await compileQukasoftMigration(xml(
    product({ category: "Kolyeler >>> Kolye Ucu", main_category: "Kolyeler", top_category: "Kolye Ucu" }),
    product({ id: "3490", productCode: "KLY 2", barcode: "100000000638", name: "Kolye 2", category: "Guzide Koleksiyonu >>> Kolye Ucu", main_category: "Guzide Koleksiyonu", top_category: "Kolye Ucu", brand: "GÜZİDE KUYUMCU" }),
  ));
  assert.deepEqual(manifest.products.map(({ categorySlugs }) => categorySlugs), [["kolyeler-kolye-ucu"], ["guzide-koleksiyonu-kolye-ucu"]]);
  assert.equal(manifest.categories.length, 4);
  assert.equal(manifest.brands.length, 1);
  assert.equal(manifest.products[1]?.sourceMetadata.fields.brand, "GÜZİDE KUYUMCU");
});

test("makes Turkish ring and tax attributes compatible with the native variant contract while retaining source labels", async () => {
  const manifest = await compileQukasoftMigration(xml(product({}, `<attributes><attribute><name>Maden</name><value>14 Ayar Altın</value></attribute></attributes><variants>${variant("14", "9", "6520052700436", "7380.00", "Yüzük Ölçüsü")}</variants>`)));
  const selected = manifest.products[0]!;
  const compiled = selected.variants[0]!;
  const { ["Ağırlık (g)"]: legacyWeight, ...nativeAttributes } = compiled.attributes;
  assert.equal(legacyWeight, "2.12");
  assert.deepEqual(nativeAttributes, { maden: "14 Ayar Altın", birim: "Adet", kdv_orani: "0.18", yuzuk_olcusu: "14" });
  const native = parseProductVariant({
    ...compiled, attributes: nativeAttributes,
    id: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222", storeId: "33333333-3333-4333-8333-333333333333",
    stockTracking: true, status: "active", version: 1, createdAt: "2026-10-02T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
  });
  assert.equal(native.attributes.yuzuk_olcusu, "14");
  assert.deepEqual(native.measurements, { weight: { valueMilli: 2120, unit: "g" } });
  assert.equal(selected.sourceMetadata.variants[0]?.name1, "Yüzük Ölçüsü");
  assert.equal(selected.sourceMetadata.attributes[0]?.name, "Maden");
  assert.equal(selected.sourceMetadata.fields.tax, "0.18");
});

test("rejects unsafe XML, invalid commerce values, duplicate identities and excessive images", async () => {
  const tooManyImages = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`image${index + 1}`, `https://cdn.qukasoft.com/${index}.webp`]));
  for (const source of [
    '<!DOCTYPE products [<!ENTITY secret SYSTEM "file:///etc/passwd">]><products/>',
    xml(product()).replace("</products>", "</broken>"),
    xml(product({ quantity: "1.5" })), xml(product({ price: "12.345" })),
    xml(product({ currency: "USD" })), xml(product({ image1: "http://cdn.qukasoft.com/a.webp" })),
    xml(product(tooManyImages)), xml(product(), product()),
    xml(product({ detail: `unsafe${String.fromCharCode(0)}` })),
  ]) await assert.rejects(() => compileQukasoftMigration(source), /qukasoft_migration_source_invalid/);
});
