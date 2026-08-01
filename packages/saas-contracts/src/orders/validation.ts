import {
  ORDER_DRAFT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  type OrderAddress,
  type OrderDashboardSummary,
  type OrderDraftConversionResult,
  type OrderDraftDetail,
  type OrderDraftLine,
  type OrderDraftListItem,
  type OrderDraftSaveIntent,
  type OrderDraftSaveLineIntent,
  type OrderDraftStatus,
  type OrderDetail,
  type OrderEvent,
  type OrderItem,
  type OrderListItem,
  type OrderNote,
  type OrderNeighbor,
  type OrderNeighbors,
  type OrderPaymentStatus,
  type OrderSource,
  type OrderStatus,
  type OrderTracking,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("order_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  const millisecondCanonical = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondCanonical) invalid();
  return value;
}

function comparableTimestamp(value: string): string {
  return value.replace(/(\.\d{3})Z$/, "$1000Z");
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function optionalString(value: Record<string, unknown>, key: string, minimum: number, maximum: number): string | undefined {
  return Object.hasOwn(value, key) ? string(value[key], minimum, maximum) : undefined;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function parseAddress(value: unknown): Readonly<OrderAddress> {
  const parsed = exact(value, ["recipientName", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  return freeze({
    recipientName: string(parsed.recipientName, 1, 200),
    line1: string(parsed.line1, 1, 300),
    ...(Object.hasOwn(parsed, "line2") ? { line2: string(parsed.line2, 1, 300) } : {}),
    ...(Object.hasOwn(parsed, "district") ? { district: string(parsed.district, 1, 200) } : {}),
    city: string(parsed.city, 1, 200),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: string(parsed.postalCode, 1, 32) } : {}),
    country: string(parsed.country, 2, 2, /^[A-Z]{2}$/),
  } satisfies OrderAddress);
}

function parseTracking(value: unknown): Readonly<OrderTracking> {
  const parsed = exact(value, ["carrier", "trackingNumber"], ["trackingUrl", "shippedAt"]);
  return freeze({
    carrier: string(parsed.carrier, 1, 100),
    trackingNumber: string(parsed.trackingNumber, 1, 200),
    ...(Object.hasOwn(parsed, "trackingUrl") ? { trackingUrl: string(parsed.trackingUrl, 1, 2_048) } : {}),
    ...(Object.hasOwn(parsed, "shippedAt") ? { shippedAt: timestamp(parsed.shippedAt) } : {}),
  } satisfies OrderTracking);
}

function parseItem(value: unknown): Readonly<OrderItem> {
  const parsed = exact(
    value,
    ["id", "position", "productName", "unitPriceCents", "quantity", "discountCents", "lineTotalCents"],
    ["variantName", "sku"],
  );
  const unitPriceCents = safeInteger(parsed.unitPriceCents, 0);
  const quantity = safeInteger(parsed.quantity, 1, 9_999);
  const discountCents = safeInteger(parsed.discountCents, 0);
  const lineTotalCents = safeInteger(parsed.lineTotalCents, 0);
  if (discountCents > unitPriceCents * quantity || lineTotalCents !== unitPriceCents * quantity - discountCents) invalid();
  return freeze({
    id: uuid(parsed.id),
    position: safeInteger(parsed.position, 0, 99),
    productName: string(parsed.productName, 1, 200),
    ...(Object.hasOwn(parsed, "variantName") ? { variantName: string(parsed.variantName, 1, 200) } : {}),
    ...(Object.hasOwn(parsed, "sku") ? { sku: string(parsed.sku, 1, 128) } : {}),
    unitPriceCents,
    quantity,
    discountCents,
    lineTotalCents,
  } satisfies OrderItem);
}

function parseEvent(value: unknown): Readonly<OrderEvent> {
  const parsed = exact(value, ["id", "type", "message", "createdAt"]);
  return freeze({
    id: uuid(parsed.id),
    type: string(parsed.type, 1, 64),
    message: string(parsed.message, 1, 500),
    createdAt: timestamp(parsed.createdAt),
  } satisfies OrderEvent);
}

function parseNote(value: unknown): Readonly<OrderNote> {
  const parsed = exact(value, ["id", "body", "createdAt", "updatedAt"]);
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (comparableTimestamp(updatedAt) < comparableTimestamp(createdAt)) invalid();
  return freeze({ id: uuid(parsed.id), body: string(parsed.body, 1, 2_000), createdAt, updatedAt } satisfies OrderNote);
}

function parseNeighbor(value: unknown): Readonly<OrderNeighbor> {
  const parsed = exact(value, ["id", "orderNumber"]);
  return freeze({
    id: uuid(parsed.id),
    orderNumber: string(parsed.orderNumber, 1, 64),
  } satisfies OrderNeighbor);
}

export function parseOrderNeighbors(value: unknown): Readonly<OrderNeighbors> {
  const parsed = exact(value, [], ["previous", "next"]);
  const previous = Object.hasOwn(parsed, "previous") ? parseNeighbor(parsed.previous) : undefined;
  const next = Object.hasOwn(parsed, "next") ? parseNeighbor(parsed.next) : undefined;
  if (previous !== undefined && next !== undefined && previous.id === next.id) invalid();
  return freeze({
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  } satisfies OrderNeighbors);
}

export function parseOrderListItem(value: unknown): Readonly<OrderListItem> {
  const parsed = exact(value, [
    "id", "orderNumber", "source", "customerName", "customerEmail", "currency", "totalCents", "status",
    "paymentStatus", "itemCount", "createdAt", "updatedAt", "version",
  ]);
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (comparableTimestamp(updatedAt) < comparableTimestamp(createdAt)) invalid();
  return freeze({
    id: uuid(parsed.id),
    orderNumber: string(parsed.orderNumber, 1, 64),
    source: status<OrderSource>(parsed.source, ORDER_SOURCES),
    customerName: string(parsed.customerName, 1, 200),
    customerEmail: string(parsed.customerEmail, 3, 320),
    currency: string(parsed.currency, 3, 3, CURRENCY),
    totalCents: safeInteger(parsed.totalCents, 0),
    status: status<OrderStatus>(parsed.status, ORDER_STATUSES),
    paymentStatus: status<OrderPaymentStatus>(parsed.paymentStatus, ORDER_PAYMENT_STATUSES),
    itemCount: safeInteger(parsed.itemCount, 0, 100),
    createdAt,
    updatedAt,
    version: safeInteger(parsed.version, 1),
  } satisfies OrderListItem);
}

export function parseOrderDetail(value: unknown): Readonly<OrderDetail> {
  const parsed = exact(value, [
    "id", "orderNumber", "source", "customerName", "customerEmail", "currency", "totalCents", "status",
    "paymentStatus", "itemCount", "createdAt", "updatedAt", "version", "subtotalCents", "shippingCents",
    "discountCents", "shippingAddress", "items", "events", "notes",
  ], ["customerPhone", "tracking"]);
  const list = parseOrderListItem({
    id: parsed.id,
    orderNumber: parsed.orderNumber,
    source: parsed.source,
    customerName: parsed.customerName,
    customerEmail: parsed.customerEmail,
    currency: parsed.currency,
    totalCents: parsed.totalCents,
    status: parsed.status,
    paymentStatus: parsed.paymentStatus,
    itemCount: parsed.itemCount,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    version: parsed.version,
  });
  const subtotalCents = safeInteger(parsed.subtotalCents, 0);
  const shippingCents = safeInteger(parsed.shippingCents, 0);
  const discountCents = safeInteger(parsed.discountCents, 0);
  if (discountCents > subtotalCents + shippingCents || list.totalCents !== subtotalCents + shippingCents - discountCents) invalid();
  const items = parseArray(parsed.items, 100, parseItem);
  const events = parseArray(parsed.events, 200, parseEvent);
  const notes = parseArray(parsed.notes, 100, parseNote);
  if (list.itemCount !== items.length) invalid();
  return freeze({
    ...list,
    ...(Object.hasOwn(parsed, "customerPhone") ? { customerPhone: string(parsed.customerPhone, 3, 32) } : {}),
    subtotalCents,
    shippingCents,
    discountCents,
    shippingAddress: parseAddress(parsed.shippingAddress),
    ...(Object.hasOwn(parsed, "tracking") ? { tracking: parseTracking(parsed.tracking) } : {}),
    items,
    events,
    notes,
  } satisfies OrderDetail);
}

function parseArray<T>(value: unknown, maximum: number, parser: (entry: unknown) => Readonly<T>): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return freeze(value.map((entry) => parser(entry)) as T[]) as readonly T[];
}

function parseDenseArray<T>(
  value: unknown,
  minimum: number,
  maximum: number,
  parser: (entry: unknown) => Readonly<T>,
): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) invalid();
    result.push(parser(descriptor.value) as T);
  }
  if (Object.keys(value).length !== value.length) invalid();
  return freeze(result) as readonly T[];
}

export function parseOrderDashboardSummary(value: unknown): Readonly<OrderDashboardSummary> {
  const parsed = exact(value, ["totalOrders", "pendingOrders", "fulfilledOrders", "revenueCents", "currency", "asOf"]);
  const totalOrders = safeInteger(parsed.totalOrders, 0);
  const pendingOrders = safeInteger(parsed.pendingOrders, 0);
  const fulfilledOrders = safeInteger(parsed.fulfilledOrders, 0);
  if (pendingOrders > totalOrders || fulfilledOrders > totalOrders) invalid();
  return freeze({
    totalOrders,
    pendingOrders,
    fulfilledOrders,
    revenueCents: safeInteger(parsed.revenueCents, 0),
    currency: string(parsed.currency, 3, 3, CURRENCY),
    asOf: timestamp(parsed.asOf),
  } satisfies OrderDashboardSummary);
}

function parseDraftLifecycle(
  parsed: Record<string, unknown>,
  draftStatus: OrderDraftStatus,
): Readonly<{ convertedOrderId?: string; convertedOrderNumber?: string }> {
  const hasOrderId = Object.hasOwn(parsed, "convertedOrderId");
  const hasOrderNumber = Object.hasOwn(parsed, "convertedOrderNumber");
  if ((draftStatus === "converted") !== (hasOrderId && hasOrderNumber) || hasOrderId !== hasOrderNumber) invalid();
  return freeze(draftStatus === "converted" ? {
    convertedOrderId: uuid(parsed.convertedOrderId),
    convertedOrderNumber: string(parsed.convertedOrderNumber, 1, 64),
  } : {});
}

function parseDraftListRecord(parsed: Record<string, unknown>): Readonly<OrderDraftListItem> {
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (comparableTimestamp(updatedAt) < comparableTimestamp(createdAt)) invalid();
  const draftStatus = status<OrderDraftStatus>(parsed.status, ORDER_DRAFT_STATUSES);
  return freeze({
    id: uuid(parsed.id),
    draftNumber: string(parsed.draftNumber, 1, 64),
    status: draftStatus,
    customerName: string(parsed.customerName, 1, 200),
    customerEmail: string(parsed.customerEmail, 3, 320),
    currency: string(parsed.currency, 3, 3) === "TRY" ? "TRY" : invalid(),
    totalCents: safeInteger(parsed.totalCents, 0),
    lineCount: safeInteger(parsed.lineCount, 1, 100),
    adjustInventory: boolean(parsed.adjustInventory),
    ...parseDraftLifecycle(parsed, draftStatus),
    createdAt,
    updatedAt,
    version: safeInteger(parsed.version, 1),
  } satisfies OrderDraftListItem);
}

export function parseOrderDraftListItem(value: unknown): Readonly<OrderDraftListItem> {
  const parsed = exact(value, [
    "id", "draftNumber", "status", "customerName", "customerEmail", "currency", "totalCents", "lineCount",
    "adjustInventory", "createdAt", "updatedAt", "version",
  ], ["convertedOrderId", "convertedOrderNumber"]);
  return parseDraftListRecord(parsed);
}

function parseDraftLine(value: unknown): Readonly<OrderDraftLine> {
  const parsed = exact(value, [
    "lineId", "position", "productId", "variantId", "productName", "unitPriceCents", "quantity", "discountCents",
    "lineTotalCents",
  ], ["variantName", "sku"]);
  const unitPriceCents = safeInteger(parsed.unitPriceCents, 0);
  const quantity = safeInteger(parsed.quantity, 1, 9_999);
  const discountCents = safeInteger(parsed.discountCents, 0);
  const lineTotalCents = safeInteger(parsed.lineTotalCents, 0);
  if (discountCents > unitPriceCents * quantity || lineTotalCents !== unitPriceCents * quantity - discountCents) invalid();
  return freeze({
    lineId: uuid(parsed.lineId),
    position: safeInteger(parsed.position, 0, 99),
    productId: uuid(parsed.productId),
    variantId: uuid(parsed.variantId),
    productName: string(parsed.productName, 1, 200),
    ...(Object.hasOwn(parsed, "variantName") ? { variantName: string(parsed.variantName, 1, 200) } : {}),
    ...(Object.hasOwn(parsed, "sku") ? { sku: string(parsed.sku, 1, 128) } : {}),
    unitPriceCents,
    quantity,
    discountCents,
    lineTotalCents,
  } satisfies OrderDraftLine);
}

function rejectDuplicateDraftLines(lines: readonly { lineId: string; variantId: string }[]): void {
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length || new Set(lines.map((line) => line.variantId)).size !== lines.length) invalid();
}

export function parseOrderDraftDetail(value: unknown): Readonly<OrderDraftDetail> {
  const parsed = exact(value, [
    "id", "draftNumber", "status", "customerName", "customerEmail", "currency", "totalCents", "lineCount",
    "adjustInventory", "createdAt", "updatedAt", "version", "subtotalCents", "shippingCents", "discountCents",
    "shippingAddress", "billingAddress", "lines",
  ], ["convertedOrderId", "convertedOrderNumber", "customerId", "customerPhone", "note"]);
  const list = parseDraftListRecord(parsed);
  const lines = parseDenseArray(parsed.lines, 1, 100, parseDraftLine);
  rejectDuplicateDraftLines(lines);
  if (lines.some((line, index) => line.position !== index) || list.lineCount !== lines.length) invalid();
  const subtotalCents = lines.reduce((sum, line) => safeInteger(sum + line.lineTotalCents, 0), 0);
  if (safeInteger(parsed.subtotalCents, 0) !== subtotalCents) invalid();
  const shippingCents = safeInteger(parsed.shippingCents, 0);
  const discountCents = safeInteger(parsed.discountCents, 0);
  if (discountCents > subtotalCents + shippingCents || list.totalCents !== subtotalCents + shippingCents - discountCents) invalid();
  return freeze({
    ...list,
    ...(Object.hasOwn(parsed, "customerId") ? { customerId: uuid(parsed.customerId) } : {}),
    ...(Object.hasOwn(parsed, "customerPhone") ? { customerPhone: string(parsed.customerPhone, 3, 32) } : {}),
    subtotalCents,
    shippingCents,
    discountCents,
    shippingAddress: parseAddress(parsed.shippingAddress),
    billingAddress: parseAddress(parsed.billingAddress),
    ...(Object.hasOwn(parsed, "note") ? { note: string(parsed.note, 1, 2_000) } : {}),
    lines,
  } satisfies OrderDraftDetail);
}

function parseDraftSaveLine(value: unknown): Readonly<OrderDraftSaveLineIntent> {
  const parsed = exact(value, ["lineId", "productId", "variantId", "quantity", "discountCents"]);
  return freeze({
    lineId: uuid(parsed.lineId),
    productId: uuid(parsed.productId),
    variantId: uuid(parsed.variantId),
    quantity: safeInteger(parsed.quantity, 1, 9_999),
    discountCents: safeInteger(parsed.discountCents, 0),
  } satisfies OrderDraftSaveLineIntent);
}

export function parseOrderDraftSaveIntent(value: unknown): Readonly<OrderDraftSaveIntent> {
  const parsed = exact(value, [
    "customerName", "customerEmail", "currency", "shippingCents", "discountCents", "shippingAddress", "billingAddress",
    "adjustInventory", "lines",
  ], ["customerId", "customerPhone", "note", "expectedVersion"]);
  const lines = parseDenseArray(parsed.lines, 1, 100, parseDraftSaveLine);
  rejectDuplicateDraftLines(lines);
  return freeze({
    ...(Object.hasOwn(parsed, "customerId") ? { customerId: uuid(parsed.customerId) } : {}),
    customerName: string(parsed.customerName, 1, 200),
    customerEmail: string(parsed.customerEmail, 3, 320),
    ...(Object.hasOwn(parsed, "customerPhone") ? { customerPhone: string(parsed.customerPhone, 3, 32) } : {}),
    currency: string(parsed.currency, 3, 3) === "TRY" ? "TRY" : invalid(),
    shippingCents: safeInteger(parsed.shippingCents, 0),
    discountCents: safeInteger(parsed.discountCents, 0),
    shippingAddress: parseAddress(parsed.shippingAddress),
    billingAddress: parseAddress(parsed.billingAddress),
    ...(Object.hasOwn(parsed, "note") ? { note: string(parsed.note, 1, 2_000) } : {}),
    adjustInventory: boolean(parsed.adjustInventory),
    lines,
    ...(Object.hasOwn(parsed, "expectedVersion") ? { expectedVersion: safeInteger(parsed.expectedVersion, 1) } : {}),
  } satisfies OrderDraftSaveIntent);
}

export function parseOrderDraftConversionResult(value: unknown): Readonly<OrderDraftConversionResult> {
  const parsed = exact(value, ["draftId", "orderId", "orderNumber", "draftVersion", "adjustedInventory", "replayed"]);
  return freeze({
    draftId: uuid(parsed.draftId),
    orderId: uuid(parsed.orderId),
    orderNumber: string(parsed.orderNumber, 1, 64),
    draftVersion: safeInteger(parsed.draftVersion, 1),
    adjustedInventory: boolean(parsed.adjustedInventory),
    replayed: boolean(parsed.replayed),
  } satisfies OrderDraftConversionResult);
}
