import {
  BARCODE_LABEL_FIELD_KEYS,
  type BarcodeInternalCreateIntent,
  type BarcodeInternalCreateResult,
  type BarcodeLabelListResult,
  BARCODE_LABEL_PAGE_SIZES,
  BARCODE_LABEL_SORTS,
  BARCODE_LABEL_STOCK_STATES,
  type BarcodeLabelTemplate,
  type BarcodeLabelTemplateConfig,
  type BarcodeLabelTemplateSaveIntent,
  type BarcodeLabelVariantRow,
  type BarcodeLabelListQuery,
  type BarcodeLabelListQueryBinding,
  type BarcodePrintJob,
  type BarcodePrintJobCreateIntent,
  type BarcodePrintJobSummary,
} from "./types.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("barcode_label_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  )
    invalid();
  return parsed;
}

function text(
  value: unknown,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  )
    invalid();
  return value;
}

function integer(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    invalid();
  return value as number;
}

function decimal(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    Math.round(value * 1000) !== value * 1000
  )
    invalid();
  return value;
}

function timestamp(value: unknown): string {
  const parsed = text(value, 24, 24);
  try {
    if (new Date(parsed).toISOString() !== parsed) invalid();
  } catch {
    invalid();
  }
  return parsed;
}

function namedResource(value: unknown): Readonly<{ id: string; name: string }> {
  const parsed = exact(value, ["id", "name"]);
  return Object.freeze({
    id: uuid(parsed.id),
    name: text(parsed.name, 1, 120),
  });
}

function attributeMap(value: unknown): Readonly<Record<string, string>> {
  const parsed = record(value);
  const entries = Object.entries(parsed);
  if (entries.length > 32 || JSON.stringify(parsed).length > 8_192) invalid();
  return Object.freeze(
    Object.fromEntries(
      entries.map(([key, nested]) => [text(key, 1, 64), text(nested, 0, 256)]),
    ),
  );
}

export function parseBarcodeLabelTemplateConfig(
  value: unknown,
): BarcodeLabelTemplateConfig {
  const parsed = exact(value, [
    "sectorProfile",
    "paperType",
    "widthMm",
    "heightMm",
    "orientation",
    "rows",
    "columns",
    "marginsMm",
    "gapMm",
    "barcodeFormat",
    "barcodeSource",
    "barcodeHeightMm",
    "showHumanReadable",
    "currencyDisplay",
    "fields",
  ]);
  if (
    !["jewelry", "apparel", "retail", "warehouse", "custom"].includes(
      String(parsed.sectorProfile),
    )
  )
    invalid();
  if (!["a4", "thermal-roll", "custom"].includes(String(parsed.paperType)))
    invalid();
  if (parsed.orientation !== "portrait" && parsed.orientation !== "landscape")
    invalid();
  if (parsed.paperType !== "a4" && parsed.orientation !== "portrait")
    invalid();
  if (parsed.barcodeFormat !== "code128" && parsed.barcodeFormat !== "ean13")
    invalid();
  if (parsed.barcodeSource !== "barcode" && parsed.barcodeSource !== "sku")
    invalid();
  if (parsed.showHumanReadable !== true && parsed.showHumanReadable !== false)
    invalid();
  if (!["symbol", "code", "none"].includes(String(parsed.currencyDisplay)))
    invalid();
  const widthMm = decimal(parsed.widthMm, 5, 300);
  const heightMm = decimal(parsed.heightMm, 5, 300);
  const margins = exact(parsed.marginsMm, ["top", "right", "bottom", "left"]);
  const marginsMm = Object.freeze({
    top: decimal(margins.top, 0, 50),
    right: decimal(margins.right, 0, 50),
    bottom: decimal(margins.bottom, 0, 50),
    left: decimal(margins.left, 0, 50),
  });
  const gap = exact(parsed.gapMm, ["horizontal", "vertical"]);
  const gapMm = Object.freeze({
    horizontal: decimal(gap.horizontal, 0, 50),
    vertical: decimal(gap.vertical, 0, 50),
  });
  const barcodeHeightMm = decimal(parsed.barcodeHeightMm, 3, 100);
  if (
    marginsMm.left + marginsMm.right >= widthMm ||
    marginsMm.top + marginsMm.bottom >= heightMm ||
    barcodeHeightMm > heightMm - marginsMm.top - marginsMm.bottom
  )
    invalid();
  if (parsed.paperType === "a4") {
    const pageWidthMm = parsed.orientation === "portrait" ? 210 : 297;
    const pageHeightMm = parsed.orientation === "portrait" ? 297 : 210;
    const rows = integer(parsed.rows, 1, 100);
    const columns = integer(parsed.columns, 1, 20);
    if (
      columns * (widthMm + gapMm.horizontal) > pageWidthMm - 8 ||
      rows * (heightMm + gapMm.vertical) > pageHeightMm - 8
    )
      invalid();
  } else if (parsed.rows !== 1 || parsed.columns !== 1) {
    invalid();
  }
  if (
    !Array.isArray(parsed.fields) ||
    parsed.fields.length < 1 ||
    parsed.fields.length > BARCODE_LABEL_FIELD_KEYS.length
  )
    invalid();
  const fields = Object.freeze(
    parsed.fields.map((candidate) => {
      const field = exact(candidate, [
        "key",
        "visible",
        "order",
        "align",
        "fontSizePt",
        "maxLines",
        "autoShrink",
      ]);
      if (!BARCODE_LABEL_FIELD_KEYS.includes(field.key as never)) invalid();
      if (field.visible !== true && field.visible !== false) invalid();
      if (!["left", "center", "right"].includes(String(field.align))) invalid();
      if (field.autoShrink !== true && field.autoShrink !== false) invalid();
      return Object.freeze({
        key: field.key as BarcodeLabelTemplateConfig["fields"][number]["key"],
        visible: field.visible,
        order: integer(field.order, 0, BARCODE_LABEL_FIELD_KEYS.length - 1),
        align:
          field.align as BarcodeLabelTemplateConfig["fields"][number]["align"],
        fontSizePt: decimal(field.fontSizePt, 5, 36),
        maxLines: integer(field.maxLines, 1, 4),
        autoShrink: field.autoShrink,
      });
    }),
  );
  if (
    new Set(fields.map(({ key }) => key)).size !== fields.length ||
    new Set(fields.map(({ order }) => order)).size !== fields.length ||
    fields.some(({ order }, index) => order !== index)
  )
    invalid();
  return Object.freeze({
    sectorProfile:
      parsed.sectorProfile as BarcodeLabelTemplateConfig["sectorProfile"],
    paperType: parsed.paperType as BarcodeLabelTemplateConfig["paperType"],
    widthMm,
    heightMm,
    orientation:
      parsed.orientation as BarcodeLabelTemplateConfig["orientation"],
    rows: integer(parsed.rows, 1, 100),
    columns: integer(parsed.columns, 1, 20),
    marginsMm,
    gapMm,
    barcodeFormat:
      parsed.barcodeFormat as BarcodeLabelTemplateConfig["barcodeFormat"],
    barcodeSource:
      parsed.barcodeSource as BarcodeLabelTemplateConfig["barcodeSource"],
    barcodeHeightMm,
    showHumanReadable: parsed.showHumanReadable,
    currencyDisplay:
      parsed.currencyDisplay as BarcodeLabelTemplateConfig["currencyDisplay"],
    fields,
  });
}

export function parseBarcodeLabelListQuery(
  value: unknown,
): BarcodeLabelListQuery {
  const parsed = record(value);
  const allowed = new Set([
    "q",
    "status",
    "stockState",
    "categoryId",
    "brandId",
    "productId",
    "hasBarcode",
    "sort",
    "pageSize",
  ]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  let q: string | undefined;
  if (Object.hasOwn(parsed, "q")) {
    if (typeof parsed.q !== "string") invalid();
    const normalized = parsed.q.trim();
    if (normalized.length > 200 || CONTROL.test(normalized)) invalid();
    if (normalized !== "") q = normalized;
  }
  const status =
    parsed.status === undefined
      ? undefined
      : parsed.status === "active" || parsed.status === "draft"
        ? parsed.status
        : invalid();
  const stockState =
    parsed.stockState === undefined
      ? undefined
      : BARCODE_LABEL_STOCK_STATES.includes(parsed.stockState as never)
        ? (parsed.stockState as BarcodeLabelListQuery["stockState"])
        : invalid();
  const categoryId =
    parsed.categoryId === undefined ? undefined : uuid(parsed.categoryId);
  const brandId =
    parsed.brandId === undefined ? undefined : uuid(parsed.brandId);
  const productId =
    parsed.productId === undefined ? undefined : uuid(parsed.productId);
  const hasBarcode =
    parsed.hasBarcode === undefined
      ? undefined
      : typeof parsed.hasBarcode === "boolean"
        ? parsed.hasBarcode
        : invalid();
  const sort =
    parsed.sort === undefined
      ? "updated-desc"
      : BARCODE_LABEL_SORTS.includes(parsed.sort as never)
        ? (parsed.sort as BarcodeLabelListQuery["sort"])
        : invalid();
  const pageSize =
    parsed.pageSize === undefined
      ? 20
      : BARCODE_LABEL_PAGE_SIZES.includes(parsed.pageSize as never)
        ? (parsed.pageSize as BarcodeLabelListQuery["pageSize"])
        : invalid();
  return Object.freeze({
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(stockState === undefined ? {} : { stockState }),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(brandId === undefined ? {} : { brandId }),
    ...(productId === undefined ? {} : { productId }),
    ...(hasBarcode === undefined ? {} : { hasBarcode }),
    sort,
    pageSize,
  });
}

export function barcodeLabelListQueryBinding(
  value: unknown,
): BarcodeLabelListQueryBinding {
  const query = parseBarcodeLabelListQuery(value);
  return Object.freeze({
    version: 1,
    q: query.q ?? null,
    status: query.status ?? null,
    stockState: query.stockState ?? null,
    categoryId: query.categoryId ?? null,
    brandId: query.brandId ?? null,
    productId: query.productId ?? null,
    hasBarcode: query.hasBarcode ?? null,
    sort: query.sort,
    pageSize: query.pageSize,
  });
}

export function barcodeLabelListQueryDigest(value: unknown): string {
  return `barcode-label-list-query:v1:${JSON.stringify(barcodeLabelListQueryBinding(value))}`;
}

export function parseBarcodeLabelVariantRow(
  value: unknown,
): BarcodeLabelVariantRow {
  const parsed = exact(
    value,
    [
      "productId",
      "productVersion",
      "variantId",
      "variantVersion",
      "productTitle",
      "variantTitle",
      "priceCents",
      "currency",
      "stock",
      "trackInventory",
      "attributes",
      "status",
      "updatedAt",
    ],
    ["sku", "barcode", "compareAtCents", "category", "brand"],
  );
  const priceCents = integer(parsed.priceCents);
  const compareAtCents =
    parsed.compareAtCents === undefined
      ? undefined
      : integer(parsed.compareAtCents);
  if (compareAtCents !== undefined && compareAtCents < priceCents) invalid();
  if (parsed.trackInventory !== true && parsed.trackInventory !== false)
    invalid();
  if (parsed.status !== "active" && parsed.status !== "draft") invalid();
  return Object.freeze({
    productId: uuid(parsed.productId),
    productVersion: integer(parsed.productVersion, 1),
    variantId: uuid(parsed.variantId),
    variantVersion: integer(parsed.variantVersion, 1),
    productTitle: text(parsed.productTitle, 1, 200),
    variantTitle: text(parsed.variantTitle, 1, 200),
    ...(parsed.sku === undefined
      ? {}
      : { sku: text(parsed.sku, 1, 64, /^[A-Z0-9][A-Z0-9._-]{0,63}$/) }),
    ...(parsed.barcode === undefined
      ? {}
      : { barcode: text(parsed.barcode, 1, 128) }),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    currency: text(parsed.currency, 3, 3, /^[A-Z]{3}$/),
    stock: integer(parsed.stock),
    trackInventory: parsed.trackInventory,
    ...(parsed.category === undefined
      ? {}
      : { category: namedResource(parsed.category) }),
    ...(parsed.brand === undefined
      ? {}
      : { brand: namedResource(parsed.brand) }),
    attributes: attributeMap(parsed.attributes),
    status: parsed.status,
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseBarcodeLabelListResult(
  value: unknown,
): BarcodeLabelListResult {
  const parsed = exact(value, ["items", "catalogTotal", "storeName"], ["nextCursor"]);
  if (!Array.isArray(parsed.items) || parsed.items.length > 100) invalid();
  const items = Object.freeze(parsed.items.map(parseBarcodeLabelVariantRow));
  if (new Set(items.map(({ variantId }) => variantId)).size !== items.length)
    invalid();
  const catalogTotal = integer(parsed.catalogTotal, items.length);
  const nextCursor =
    parsed.nextCursor === undefined
      ? undefined
      : text(parsed.nextCursor, 1, 2_048, /^[A-Za-z0-9_-]+$/);
  return Object.freeze({
    items,
    catalogTotal,
    storeName: text(parsed.storeName, 1, 120),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export function parseBarcodeLabelTemplate(
  value: unknown,
): BarcodeLabelTemplate {
  const parsed = exact(value, [
    "id",
    "name",
    "config",
    "status",
    "isDefault",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  if (parsed.status !== "active" && parsed.status !== "archived") invalid();
  if (parsed.isDefault !== true && parsed.isDefault !== false) invalid();
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (
    updatedAt < createdAt ||
    (parsed.status === "archived" && parsed.isDefault === true)
  )
    invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    name: text(parsed.name, 1, 120),
    config: parseBarcodeLabelTemplateConfig(parsed.config),
    status: parsed.status,
    isDefault: parsed.isDefault,
    version: integer(parsed.version, 1),
    createdAt,
    updatedAt,
  });
}

export function parseBarcodeLabelTemplateSaveIntent(
  value: unknown,
): BarcodeLabelTemplateSaveIntent {
  const parsed = exact(
    value,
    ["name", "config", "makeDefault"],
    ["templateId", "expectedVersion"],
  );
  if (
    (parsed.templateId === undefined) !==
    (parsed.expectedVersion === undefined)
  )
    invalid();
  if (parsed.makeDefault !== true && parsed.makeDefault !== false) invalid();
  return Object.freeze({
    name: text(parsed.name, 1, 120),
    config: parseBarcodeLabelTemplateConfig(parsed.config),
    makeDefault: parsed.makeDefault,
    ...(parsed.templateId === undefined
      ? {}
      : {
          templateId: uuid(parsed.templateId),
          expectedVersion: integer(parsed.expectedVersion, 1),
        }),
  });
}

export function parseBarcodeInternalCreateIntent(
  value: unknown,
): BarcodeInternalCreateIntent {
  const parsed = exact(value, ["targets"]);
  if (
    !Array.isArray(parsed.targets) ||
    parsed.targets.length < 1 ||
    parsed.targets.length > 200
  )
    invalid();
  const targets = Object.freeze(
    parsed.targets.map((candidate) => {
      const target = exact(candidate, ["variantId", "expectedVersion"]);
      return Object.freeze({
        variantId: uuid(target.variantId),
        expectedVersion: integer(target.expectedVersion, 1),
      });
    }),
  );
  if (
    new Set(targets.map(({ variantId }) => variantId)).size !== targets.length
  )
    invalid();
  return Object.freeze({ targets });
}

export function parseBarcodeInternalCreateResult(
  value: unknown,
): BarcodeInternalCreateResult {
  const parsed = exact(value, ["succeeded", "failed", "replayed"]);
  if (
    !Array.isArray(parsed.succeeded) ||
    !Array.isArray(parsed.failed) ||
    parsed.succeeded.length + parsed.failed.length > 200
  )
    invalid();
  if (parsed.replayed !== true && parsed.replayed !== false) invalid();
  const succeeded = Object.freeze(
    parsed.succeeded.map((candidate) => {
      const row = exact(candidate, ["variantId", "barcode", "version"]);
      return Object.freeze({
        variantId: uuid(row.variantId),
        barcode: text(row.barcode, 12, 68, /^CXI-[A-Z0-9]+$/),
        version: integer(row.version, 1),
      });
    }),
  );
  const failed = Object.freeze(
    parsed.failed.map((candidate) => {
      const row = exact(candidate, ["variantId", "code"]);
      if (
        !["existing_barcode", "variant_not_found", "version_conflict"].includes(
          String(row.code),
        )
      )
        invalid();
      return Object.freeze({
        variantId: uuid(row.variantId),
        code: row.code as BarcodeInternalCreateResult["failed"][number]["code"],
      });
    }),
  );
  const allIds = [...succeeded, ...failed].map(({ variantId }) => variantId);
  if (new Set(allIds).size !== allIds.length) invalid();
  return Object.freeze({ succeeded, failed, replayed: parsed.replayed });
}

export function parseBarcodePrintJobCreateIntent(
  value: unknown,
): BarcodePrintJobCreateIntent {
  const parsed = exact(value, [
    "template",
    "templateConfig",
    "targets",
    "outputType",
    "printerProfile",
    "startCell",
  ]);
  const templateValue = record(parsed.template);
  let template: BarcodePrintJobCreateIntent["template"];
  if (templateValue.kind === "system") {
    const system = exact(templateValue, ["kind", "key"]);
    template = Object.freeze({
      kind: "system",
      key: text(system.key, 3, 80, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    });
  } else if (templateValue.kind === "custom") {
    const custom = exact(templateValue, [
      "kind",
      "templateId",
      "expectedVersion",
    ]);
    template = Object.freeze({
      kind: "custom",
      templateId: uuid(custom.templateId),
      expectedVersion: integer(custom.expectedVersion, 1),
    });
  } else invalid();
  if (
    !Array.isArray(parsed.targets) ||
    parsed.targets.length < 1 ||
    parsed.targets.length > 500
  )
    invalid();
  const targets = Object.freeze(
    parsed.targets.map((candidate) => {
      const target = exact(candidate, [
        "variantId",
        "expectedVersion",
        "quantity",
      ]);
      return Object.freeze({
        variantId: uuid(target.variantId),
        expectedVersion: integer(target.expectedVersion, 1),
        quantity: integer(target.quantity, 1, 10_000),
      });
    }),
  );
  if (
    new Set(targets.map(({ variantId }) => variantId)).size !==
      targets.length ||
    targets.reduce((total, { quantity }) => total + quantity, 0) > 5_000
  )
    invalid();
  if (!["browser", "pdf", "zpl"].includes(String(parsed.outputType))) invalid();
  if (
    !["a4", "thermal", "zebra-203", "zebra-300"].includes(
      String(parsed.printerProfile),
    )
  )
    invalid();
  const templateConfig = parseBarcodeLabelTemplateConfig(
    parsed.templateConfig,
  );
  const outputType = parsed.outputType as BarcodePrintJobCreateIntent["outputType"];
  const printerProfile =
    parsed.printerProfile as BarcodePrintJobCreateIntent["printerProfile"];
  const startCell = integer(parsed.startCell, 0, 47);
  if (
    outputType === "zpl"
      ? !["zebra-203", "zebra-300"].includes(printerProfile) ||
        templateConfig.paperType === "a4" ||
        startCell !== 0
      : !["browser", "pdf"].includes(outputType) ||
        printerProfile !==
          (templateConfig.paperType === "a4" ? "a4" : "thermal") ||
        (templateConfig.paperType === "a4"
          ? startCell >= templateConfig.rows * templateConfig.columns
          : startCell !== 0)
  )
    invalid();
  return Object.freeze({
    template,
    templateConfig,
    targets,
    outputType,
    printerProfile,
    startCell,
  });
}

export function parseBarcodePrintJob(value: unknown): BarcodePrintJob {
  const parsed = exact(
    value,
    [
      "id",
      "principalId",
      "storeName",
      "templateName",
      "templateConfig",
      "outputType",
      "printerProfile",
      "startCell",
      "variantCount",
      "labelCount",
      "status",
      "items",
      "createdAt",
    ],
    ["templateId"],
  );
  if (!["browser", "pdf", "zpl"].includes(String(parsed.outputType))) invalid();
  if (
    !["a4", "thermal", "zebra-203", "zebra-300"].includes(
      String(parsed.printerProfile),
    )
  )
    invalid();
  if (parsed.status !== "prepared") invalid();
  if (
    !Array.isArray(parsed.items) ||
    parsed.items.length < 1 ||
    parsed.items.length > 500
  )
    invalid();
  const items = Object.freeze(
    parsed.items.map((candidate) => {
      const item = exact(candidate, ["variantId", "quantity", "snapshot"]);
      const snapshot = parseBarcodeLabelVariantRow(item.snapshot);
      const variantId = uuid(item.variantId);
      if (snapshot.variantId !== variantId) invalid();
      return Object.freeze({
        variantId,
        quantity: integer(item.quantity, 1, 10_000),
        snapshot,
      });
    }),
  );
  if (new Set(items.map(({ variantId }) => variantId)).size !== items.length)
    invalid();
  const labelCount = items.reduce((total, { quantity }) => total + quantity, 0);
  if (
    integer(parsed.variantCount, 1, 500) !== items.length ||
    integer(parsed.labelCount, 1, 5_000) !== labelCount
  )
    invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    principalId: uuid(parsed.principalId),
    storeName: text(parsed.storeName, 1, 120),
    ...(parsed.templateId === undefined
      ? {}
      : { templateId: uuid(parsed.templateId) }),
    templateName: text(parsed.templateName, 1, 120),
    templateConfig: parseBarcodeLabelTemplateConfig(parsed.templateConfig),
    outputType: parsed.outputType as BarcodePrintJob["outputType"],
    printerProfile: parsed.printerProfile as BarcodePrintJob["printerProfile"],
    startCell: integer(parsed.startCell, 0, 47),
    variantCount: items.length,
    labelCount,
    status: "prepared",
    items,
    createdAt: timestamp(parsed.createdAt),
  });
}
export function parseBarcodePrintJobList(
  value: unknown,
): readonly BarcodePrintJobSummary[] {
  if (!Array.isArray(value) || value.length > 100) invalid();
  return Object.freeze(value.map(parseBarcodePrintJobSummary));
}

export function parseBarcodePrintJobSummary(
  value: unknown,
): BarcodePrintJobSummary {
  const parsed = exact(
    value,
    [
      "id",
      "templateName",
      "outputType",
      "printerProfile",
      "startCell",
      "variantCount",
      "labelCount",
      "status",
      "createdAt",
    ],
    ["templateId"],
  );
  if (!['browser', 'pdf', 'zpl'].includes(String(parsed.outputType))) invalid();
  if (!['a4', 'thermal', 'zebra-203', 'zebra-300'].includes(String(parsed.printerProfile))) invalid();
  if (parsed.status !== "prepared") invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    ...(parsed.templateId === undefined ? {} : { templateId: uuid(parsed.templateId) }),
    templateName: text(parsed.templateName, 1, 120),
    outputType: parsed.outputType as BarcodePrintJobSummary["outputType"],
    printerProfile: parsed.printerProfile as BarcodePrintJobSummary["printerProfile"],
    startCell: integer(parsed.startCell, 0, 47),
    variantCount: integer(parsed.variantCount, 1, 500),
    labelCount: integer(parsed.labelCount, 1, 5_000),
    status: "prepared",
    createdAt: timestamp(parsed.createdAt),
  });
}
