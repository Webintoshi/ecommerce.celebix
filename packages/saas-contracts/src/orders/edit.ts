import { ORDER_SOURCES, type OrderAddress, type OrderSource } from './types.ts';
export type OrderEditLineIntent = Readonly<{
    lineId: string;
    productId: string | null;
    variantId: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
}>;
export type OrderEditLine = OrderEditLineIntent & Readonly<{
    productName: string;
    variantName: string | null;
    sku: string | null;
    lineTotalCents: number;
}>;
export type OrderEditIntent = Readonly<{
    expectedVersion: number;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingAddress: Readonly<OrderAddress> | null;
    billingAddress: Readonly<OrderAddress> | null;
    shippingCents: number;
    discountCents: number;
    reason: string;
    lines: readonly OrderEditLineIntent[];
}>;
export type OrderEditFinance = Readonly<{
    collectedCents: number;
    settlementDiscountCents: number;
    dueCents: number;
    refundDueCents: number;
}>;
export type OrderEditWorkspace = Readonly<{
    orderId: string;
    orderNumber: string;
    version: number;
    currency: string;
    source: OrderSource;
    canEdit: boolean;
    blockReason: string | null;
    canEditPrices: boolean;
    discountLimitBps: number;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingAddress: Readonly<OrderAddress> | null;
    billingAddress: Readonly<OrderAddress> | null;
    subtotalCents: number;
    shippingCents: number;
    discountCents: number;
    totalCents: number;
    lines: readonly OrderEditLine[];
    finance: OrderEditFinance;
}>;
export type OrderEditProduct = Readonly<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string | null;
    unitPriceCents: number;
}>;
export type OrderEditProducts = Readonly<{
    items: readonly OrderEditProduct[];
    hasMore: boolean;
}>;
export type OrderEditPreview = Readonly<{
    orderId: string;
    expectedVersion: number;
    fingerprint: string;
    beforeTotalCents: number;
    afterSubtotalCents: number;
    afterShippingCents: number;
    afterDiscountCents: number;
    afterTotalCents: number;
    collectedCents: number;
    settlementDiscountCents: number;
    dueCents: number;
    refundDueCents: number;
    stockChanges: readonly Readonly<{
        variantId: string;
        locationId: string | null;
        quantityDelta: number;
    }>[];
    commissionDeltaCents: number | null;
}>;
export type OrderEditResult = Readonly<{
    orderId: string;
    version: number;
    operationId: string;
    replayed: boolean;
    preview: OrderEditPreview;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX = 8000000000;
function bad(): never { throw new TypeError('order_edit_contract_invalid'); }
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        bad();
    const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...keys, ...optional]);
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.has(key) || !('value' in descriptors[key]!)) || keys.some(key => !Object.hasOwn(descriptors, key)))
        bad();
    return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, pattern?: RegExp): string { if (typeof value !== 'string' || value !== value.trim() || value.length < min || value.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || pattern && !pattern.test(value))
    bad(); return value; }
function nullable(value: unknown, max: number, pattern?: RegExp): string | null { return value === null ? null : text(value, 1, max, pattern); }
function uuid(value: unknown): string { return text(value, 36, 36, UUID); }
function nullableUuid(value: unknown): string | null { return value === null ? null : uuid(value); }
function integer(value: unknown, min = 0, max = MAX): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    bad(); return value as number; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean')
    bad(); return value; }
function list<T>(value: unknown, parse: (v: unknown) => T, min = 0, max = 100): readonly T[] { if (!Array.isArray(value) || value.length < min || value.length > max)
    bad(); const descriptors = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(value).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || !('value' in descriptors[key]!))))
    bad(); const result = []; for (let i = 0; i < value.length; i++) {
    if (!descriptors[i] || !('value' in descriptors[i]!))
        bad();
    result.push(parse(descriptors[i]!.value));
} return Object.freeze(result); }
function address(value: unknown): Readonly<OrderAddress> | null { if (value === null)
    return null; const r = record(value, ['recipientName', 'line1', 'city', 'country'], ['line2', 'district', 'postalCode']); return Object.freeze({ recipientName: text(r.recipientName, 1, 200), line1: text(r.line1, 1, 500), city: text(r.city, 1, 100), country: text(r.country, 2, 2, /^[A-Z]{2}$/), ...(r.line2 === undefined ? {} : { line2: text(r.line2, 1, 500) }), ...(r.district === undefined ? {} : { district: text(r.district, 1, 100) }), ...(r.postalCode === undefined ? {} : { postalCode: text(r.postalCode, 1, 32) }) }); }
const LINE = ['lineId', 'productId', 'variantId', 'quantity', 'unitPriceCents', 'discountCents'];
function line(value: unknown, metadata = false): OrderEditLineIntent | OrderEditLine { const r = record(value, metadata ? [...LINE, 'productName', 'variantName', 'sku', 'lineTotalCents'] : LINE); const productId = nullableUuid(r.productId), variantId = nullableUuid(r.variantId); if ((productId === null) !== (variantId === null))
    bad(); const quantity = integer(r.quantity, 1, 9999), unitPriceCents = integer(r.unitPriceCents), discountCents = integer(r.discountCents), gross = quantity * unitPriceCents; if (!Number.isSafeInteger(gross) || gross > MAX || discountCents > gross)
    bad(); const parsed = { lineId: uuid(r.lineId), productId, variantId, quantity, unitPriceCents, discountCents }; if (!metadata)
    return Object.freeze(parsed); if (integer(r.lineTotalCents) !== gross - discountCents)
    bad(); return Object.freeze({ ...parsed, productName: text(r.productName, 1, 200), variantName: nullable(r.variantName, 200), sku: nullable(r.sku, 128), lineTotalCents: r.lineTotalCents as number }); }
function unique<T extends OrderEditLineIntent>(lines: readonly T[]): readonly T[] { if (new Set(lines.map(row => row.lineId)).size !== lines.length)
    bad(); return lines; }
const CUSTOMER = ['customerName', 'customerEmail', 'customerPhone', 'shippingAddress', 'billingAddress'];
function customer(r: Record<string, unknown>) { return { customerName: nullable(r.customerName, 201), customerEmail: nullable(r.customerEmail, 320, /^[^\s@]+@[^\s@]+\.[^\s@]+$/), customerPhone: nullable(r.customerPhone, 32), shippingAddress: address(r.shippingAddress), billingAddress: address(r.billingAddress) }; }
export function parseOrderEditIntent(value: unknown): OrderEditIntent { const r = record(value, ['expectedVersion', ...CUSTOMER, 'shippingCents', 'discountCents', 'reason', 'lines']); const lines = unique(list(r.lines, v => line(v), 1)); const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents - l.discountCents, 0), shippingCents = integer(r.shippingCents), discountCents = integer(r.discountCents); if (subtotal + shippingCents > MAX || discountCents > subtotal)
    bad(); return Object.freeze({ expectedVersion: integer(r.expectedVersion, 1, Number.MAX_SAFE_INTEGER), ...customer(r), shippingCents, discountCents, reason: text(r.reason, 1, 500), lines }); }
function finance(value: unknown): OrderEditFinance { const r = record(value, ['collectedCents', 'settlementDiscountCents', 'dueCents', 'refundDueCents']); return Object.freeze({ collectedCents: integer(r.collectedCents), settlementDiscountCents: integer(r.settlementDiscountCents), dueCents: integer(r.dueCents), refundDueCents: integer(r.refundDueCents) }); }
export function parseOrderEditWorkspace(value: unknown): OrderEditWorkspace { const r = record(value, ['orderId', 'orderNumber', 'version', 'currency', 'source', 'canEdit', 'blockReason', 'canEditPrices', 'discountLimitBps', ...CUSTOMER, 'subtotalCents', 'shippingCents', 'discountCents', 'totalCents', 'lines', 'finance']); if (typeof r.source !== 'string' || !ORDER_SOURCES.includes(r.source as OrderSource))
    bad(); const canEdit = bool(r.canEdit), blockReason = nullable(r.blockReason, 100); if (canEdit && blockReason !== null || !canEdit && blockReason === null)
    bad(); return Object.freeze({ orderId: uuid(r.orderId), orderNumber: text(r.orderNumber, 1, 100), version: integer(r.version, 1, Number.MAX_SAFE_INTEGER), currency: text(r.currency, 3, 3, /^[A-Z]{3}$/), source: r.source as OrderSource, canEdit, blockReason, canEditPrices: bool(r.canEditPrices), discountLimitBps: integer(r.discountLimitBps, 0, 10000), ...customer(r), subtotalCents: integer(r.subtotalCents), shippingCents: integer(r.shippingCents), discountCents: integer(r.discountCents), totalCents: integer(r.totalCents), lines: unique(list(r.lines, v => line(v, true) as OrderEditLine)), finance: finance(r.finance) }); }
export function parseOrderEditProducts(value: unknown): OrderEditProducts { const r = record(value, ['items', 'hasMore']); const items = list(r.items, v => { const row = record(v, ['productId', 'variantId', 'productName', 'variantName', 'sku', 'unitPriceCents']); return Object.freeze({ productId: uuid(row.productId), variantId: uuid(row.variantId), productName: text(row.productName, 1, 200), variantName: text(row.variantName, 1, 200), sku: nullable(row.sku, 128), unitPriceCents: integer(row.unitPriceCents) }); }, 0, 50); if (new Set(items.map(v => v.variantId)).size !== items.length)
    bad(); return Object.freeze({ items, hasMore: bool(r.hasMore) }); }
export function parseOrderEditPreview(value: unknown): OrderEditPreview { const r = record(value, ['orderId', 'expectedVersion', 'fingerprint', 'beforeTotalCents', 'afterSubtotalCents', 'afterShippingCents', 'afterDiscountCents', 'afterTotalCents', 'collectedCents', 'settlementDiscountCents', 'dueCents', 'refundDueCents', 'stockChanges', 'commissionDeltaCents']); const f = finance({ collectedCents: r.collectedCents, settlementDiscountCents: r.settlementDiscountCents, dueCents: r.dueCents, refundDueCents: r.refundDueCents }); const subtotal = integer(r.afterSubtotalCents), shipping = integer(r.afterShippingCents), discount = integer(r.afterDiscountCents), total = integer(r.afterTotalCents), obligation = Math.max(0, total - f.settlementDiscountCents); if (discount > subtotal || total !== subtotal + shipping - discount || f.dueCents !== Math.max(0, obligation - f.collectedCents) || f.refundDueCents !== Math.max(0, f.collectedCents - obligation))
    bad(); return Object.freeze({ orderId: uuid(r.orderId), expectedVersion: integer(r.expectedVersion, 1, Number.MAX_SAFE_INTEGER), fingerprint: text(r.fingerprint, 64, 64, /^[a-f0-9]{64}$/), beforeTotalCents: integer(r.beforeTotalCents), afterSubtotalCents: subtotal, afterShippingCents: shipping, afterDiscountCents: discount, afterTotalCents: total, ...f, stockChanges: list(r.stockChanges, v => { const s = record(v, ['variantId', 'locationId', 'quantityDelta']); return Object.freeze({ variantId: uuid(s.variantId), locationId: nullableUuid(s.locationId), quantityDelta: integer(s.quantityDelta, -999999, 999999) }); }, 0, 200), commissionDeltaCents: r.commissionDeltaCents === null ? null : integer(r.commissionDeltaCents, -MAX, MAX) }); }
export function parseOrderEditResult(value: unknown): OrderEditResult { const r = record(value, ['orderId', 'version', 'operationId', 'replayed', 'preview']); const preview = parseOrderEditPreview(r.preview), orderId = uuid(r.orderId), version = integer(r.version, 2, Number.MAX_SAFE_INTEGER); if (orderId !== preview.orderId || version !== preview.expectedVersion + 1)
    bad(); return Object.freeze({ orderId, version, operationId: uuid(r.operationId), replayed: bool(r.replayed), preview }); }
