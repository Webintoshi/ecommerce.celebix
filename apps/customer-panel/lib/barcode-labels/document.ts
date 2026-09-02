import {
  parseBarcodeLabelTemplateConfig,
  parseBarcodeLabelVariantRow,
  type BarcodeLabelFieldKey,
  type BarcodeLabelTemplateConfig,
  type BarcodeLabelVariantRow,
  type BarcodePrinterProfile,
} from "@celebix/saas-contracts";

import {
  barcodeFitsLabel,
  minimumBarcodeModuleMm,
  validateBarcodeValue,
} from "./barcodes.ts";

export type LabelDocumentField = Readonly<{
  key: BarcodeLabelFieldKey;
  value: string;
  align: "left" | "center" | "right";
  fontSizePt: number;
  maxLines: number;
  autoShrink: boolean;
}>;

export type LabelDocumentItem = Readonly<{
  variantId: string;
  quantity: number;
  fields: readonly LabelDocumentField[];
  barcode: Readonly<{
    format: "code128" | "ean13";
    value: string;
    heightMm: number;
    showHumanReadable: boolean;
    quietZoneModules: number;
  }>;
  source: BarcodeLabelVariantRow;
}>;

export type LabelDocumentError = Readonly<{
  variantId: string;
  code:
    | "barcode_missing"
    | "code128_invalid"
    | "ean13_length"
    | "ean13_checksum"
    | "barcode_overflow"
    | "layout_overflow"
    | "text_overflow";
  message: string;
}>;

export type LabelDocument = Readonly<{
  schemaVersion: 1;
  templateName: string;
  template: BarcodeLabelTemplateConfig;
  printerProfile: BarcodePrinterProfile;
  startCell: number;
  variantCount: number;
  labelCount: number;
  items: readonly LabelDocumentItem[];
  errors: readonly LabelDocumentError[];
}>;

type BuildInput = Readonly<{
  templateName: string;
  template: BarcodeLabelTemplateConfig;
  printerProfile: BarcodePrinterProfile;
  startCell: number;
  storeName?: string;
  items: readonly Readonly<{ row: BarcodeLabelVariantRow; quantity: number }>[];
}>;

const ERROR_MESSAGES = Object.freeze({
  barcode_missing: "Bu varyantta barkod veya SKU bulunmuyor.",
  code128_invalid:
    "Code 128 değeri yazdırılabilir ASCII karakterleri içermeli.",
  ean13_length: "EAN-13 değeri tam olarak 13 basamak olmalı.",
  ean13_checksum: "EAN-13 kontrol basamağı geçersiz.",
  barcode_overflow:
    "Barkod seçilen etiket genişliğine taranabilir biçimde sığmıyor.",
  layout_overflow: "Etiket içeriği seçilen yüksekliğe sığmıyor.",
  text_overflow: "Etiket metni seçilen ölçüye sığmıyor.",
} satisfies Record<LabelDocumentError["code"], string>);

function normalizeAttributeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function attributeLines(
  row: BarcodeLabelVariantRow,
  sector: BarcodeLabelTemplateConfig["sectorProfile"],
): string[] {
  const entries = Object.entries(row.attributes).filter(
    ([, value]) => value !== "",
  );
  const normalized = new Map(
    entries.map(([key, value]) => [normalizeAttributeKey(key), value]),
  );
  const configured =
    sector === "jewelry"
      ? ([
          ["ayar", "Ayar"],
          ["maden", "Maden"],
          ["agirlik", "Ağırlık"],
          ["karat", "Karat"],
          ["tas", "Taş"],
          ["sertifika_numarasi", "Sertifika numarası"],
        ] as const)
      : sector === "apparel"
        ? ([
            ["beden", "Beden"],
            ["size", "Beden"],
            ["renk", "Renk"],
            ["color", "Renk"],
          ] as const)
        : undefined;
  if (configured === undefined)
    return entries.map(([key, value]) => `${key}: ${value}`);
  const seen = new Set<string>();
  return configured.flatMap(([key, label]) => {
    const value = normalized.get(key);
    if (value === undefined || seen.has(label)) return [];
    seen.add(label);
    return [`${label}: ${value}`];
  });
}

function money(
  cents: number,
  currency: string,
  display: BarcodeLabelTemplateConfig["currencyDisplay"],
): string {
  if (display === "none") {
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  }
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    currencyDisplay: display === "code" ? "code" : "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(cents / 100)
    .replace(/\s/g, "");
}

function fieldValue(
  key: BarcodeLabelFieldKey,
  row: BarcodeLabelVariantRow,
  template: BarcodeLabelTemplateConfig,
  storeName: string | undefined,
  barcodeValue: string | undefined,
): string | undefined {
  if (key === "storeName") return storeName;
  if (key === "productTitle") return row.productTitle;
  if (key === "variantTitle") return row.variantTitle;
  if (key === "sku") return row.sku;
  if (key === "barcodeSymbol")
    return barcodeValue === undefined ? undefined : "__BARCODE__";
  if (key === "barcodeValue") return barcodeValue;
  if (key === "price")
    return money(row.priceCents, row.currency, template.currencyDisplay);
  if (key === "compareAtPrice")
    return row.compareAtCents === undefined
      ? undefined
      : money(row.compareAtCents, row.currency, template.currencyDisplay);
  if (key === "brand") return row.brand?.name;
  if (key === "category") return row.category?.name;
  if (key === "stock")
    return row.trackInventory ? `Stok: ${row.stock}` : "Stok takibi kapalı";
  const attributes = attributeLines(row, template.sectorProfile);
  return attributes.length === 0 ? undefined : attributes.join("\n");
}

function projectedFields(
  row: BarcodeLabelVariantRow,
  template: BarcodeLabelTemplateConfig,
  storeName: string | undefined,
  barcodeValue: string | undefined,
): readonly LabelDocumentField[] {
  return Object.freeze(
    template.fields
      .filter(({ visible }) => visible)
      .flatMap((field) => {
        const value = fieldValue(
          field.key,
          row,
          template,
          storeName,
          barcodeValue,
        );
        if (value === undefined || value === "") return [];
        return [
          Object.freeze({
            key: field.key,
            value,
            align: field.align,
            fontSizePt: field.fontSizePt,
            maxLines: field.maxLines,
            autoShrink: field.autoShrink,
          }),
        ];
      }),
  );
}

function textOverflows(
  field: LabelDocumentField,
  availableWidthMm: number,
): boolean {
  if (field.key === "barcodeSymbol") return false;
  const longestLine = field.value
    .split("\n")
    .reduce((longest, line) => Math.max(longest, line.length), 0);
  const capacity =
    Math.max(1, Math.floor(availableWidthMm / (field.fontSizePt * 0.16))) *
    field.maxLines;
  return longestLine > capacity * (field.autoShrink ? 1.5 : 1);
}

function resolveTextFields(
  fields: readonly LabelDocumentField[],
  availableWidthMm: number,
): readonly LabelDocumentField[] {
  return Object.freeze(
    fields.map((field) => {
      if (field.key === "barcodeSymbol") return field;
      let fontSizePt = field.fontSizePt;
      const normalized = field.value.replace(/\s+/g, " ").trim();
      const capacity = () =>
        Math.max(1, Math.floor(availableWidthMm / (fontSizePt * 0.16)));
      while (
        field.autoShrink &&
        Math.ceil(normalized.length / capacity()) > field.maxLines &&
        fontSizePt > 5
      )
        fontSizePt = Math.max(5, Math.round((fontSizePt - 0.5) * 10) / 10);
      const lineLength = capacity();
      const maximum = lineLength * field.maxLines;
      if (!field.autoShrink && normalized.length > maximum)
        return Object.freeze({ ...field, value: normalized });
      const resolved =
        field.autoShrink && normalized.length > maximum
          ? `${normalized.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`
          : normalized;
      const lines = Array.from(
        { length: Math.ceil(resolved.length / lineLength) },
        (_, index) =>
          resolved.slice(index * lineLength, (index + 1) * lineLength),
      ).slice(0, field.maxLines);
      return Object.freeze({
        ...field,
        value: lines.join("\n"),
        fontSizePt,
      });
    }),
  );
}

function contentHeightMm(
  fields: readonly LabelDocumentField[],
  barcodeHeightMm: number,
  showHumanReadable: boolean,
  availableWidthMm: number,
): number {
  return fields.reduce((height, field) => {
    if (field.key === "barcodeSymbol")
      return height + barcodeHeightMm + (showHumanReadable ? 3 : 0);
    const charactersPerLine = Math.max(
      1,
      Math.floor(
        availableWidthMm /
          (field.fontSizePt * 0.16 * (field.autoShrink ? 0.85 : 1)),
      ),
    );
    const lines = Math.min(
      field.maxLines,
      field.value
        .split("\n")
        .reduce(
          (count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)),
          0,
        ),
    );
    return height + field.fontSizePt * 0.352778 * 1.15 * lines;
  }, 0);
}

function inputRecord(value: unknown): BuildInput {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("label_document_invalid");
  return value as BuildInput;
}

export function buildLabelDocument(value: unknown): LabelDocument {
  const input = inputRecord(value);
  if (
    typeof input.templateName !== "string" ||
    input.templateName.length < 1 ||
    input.templateName.length > 120 ||
    !["a4", "thermal", "zebra-203", "zebra-300"].includes(
      input.printerProfile,
    ) ||
    !Number.isSafeInteger(input.startCell) ||
    input.startCell < 0 ||
    input.startCell > 47 ||
    !Array.isArray(input.items) ||
    input.items.length > 500 ||
    (input.storeName !== undefined &&
      (input.storeName.length < 1 || input.storeName.length > 120))
  )
    throw new TypeError("label_document_invalid");
  const template = parseBarcodeLabelTemplateConfig(input.template);
  const isA4 = template.paperType === "a4";
  if (
    (isA4 && input.printerProfile !== "a4") ||
    (!isA4 && input.printerProfile === "a4") ||
    (isA4
      ? input.startCell >= template.rows * template.columns
      : input.startCell !== 0)
  )
    throw new TypeError("label_document_invalid");
  const seen = new Set<string>();
  let labelCount = 0;
  const errors: LabelDocumentError[] = [];
  const items = Object.freeze(
    input.items.flatMap((entry) => {
      const row = parseBarcodeLabelVariantRow(entry.row);
      if (
        seen.has(row.variantId) ||
        !Number.isSafeInteger(entry.quantity) ||
        entry.quantity < 0 ||
        entry.quantity > 10_000
      )
        throw new TypeError("label_document_invalid");
      seen.add(row.variantId);
      if (entry.quantity === 0) return [];
      labelCount += entry.quantity;
      if (labelCount > 5_000) throw new TypeError("label_document_invalid");
      const barcodeValue =
        template.barcodeSource === "sku" ? row.sku : row.barcode;
      const validation = validateBarcodeValue(
        template.barcodeFormat,
        barcodeValue,
      );
      if (!validation.valid) {
        const code = validation.code!;
        errors.push(
          Object.freeze({
            variantId: row.variantId,
            code,
            message: ERROR_MESSAGES[code],
          }),
        );
      }
      const availableWidthMm =
        template.widthMm - template.marginsMm.left - template.marginsMm.right;
      if (
        validation.valid &&
        !barcodeFitsLabel({
          format: template.barcodeFormat,
          value: barcodeValue!,
          availableWidthMm,
          minimumModuleMm: minimumBarcodeModuleMm(
            template.barcodeFormat,
            input.printerProfile,
          ),
        })
      ) {
        errors.push(
          Object.freeze({
            variantId: row.variantId,
            code: "barcode_overflow",
            message: ERROR_MESSAGES.barcode_overflow,
          }),
        );
      }
      const fields = resolveTextFields(
        projectedFields(row, template, input.storeName, barcodeValue),
        availableWidthMm,
      );
      if (fields.some((field) => textOverflows(field, availableWidthMm))) {
        errors.push(
          Object.freeze({
            variantId: row.variantId,
            code: "text_overflow",
            message: ERROR_MESSAGES.text_overflow,
          }),
        );
      }
      const availableHeightMm =
        template.heightMm - template.marginsMm.top - template.marginsMm.bottom;
      if (
        contentHeightMm(
          fields,
          template.barcodeHeightMm,
          template.showHumanReadable,
          availableWidthMm,
        ) > availableHeightMm
      ) {
        errors.push(
          Object.freeze({
            variantId: row.variantId,
            code: "layout_overflow",
            message: ERROR_MESSAGES.layout_overflow,
          }),
        );
      }
      return [
        Object.freeze({
          variantId: row.variantId,
          quantity: entry.quantity,
          fields,
          barcode: Object.freeze({
            format: template.barcodeFormat,
            value: barcodeValue ?? "",
            heightMm: template.barcodeHeightMm,
            showHumanReadable: template.showHumanReadable,
            quietZoneModules: template.barcodeFormat === "ean13" ? 11 : 10,
          }),
          source: row,
        }),
      ];
    }),
  );
  return Object.freeze({
    schemaVersion: 1,
    templateName: input.templateName,
    template,
    printerProfile: input.printerProfile,
    startCell: input.startCell,
    variantCount: items.length,
    labelCount,
    items,
    errors: Object.freeze(errors),
  });
}
