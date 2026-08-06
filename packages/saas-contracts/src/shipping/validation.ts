import {
  SHIPMENT_DIRECTIONS,
  SHIPMENT_STATUSES,
  SHIPPING_CONNECTION_STATUSES,
  SHIPPING_PROVIDER_CODES,
  SHIPPING_QUOTE_STATUSES,
  SHIPPING_RESOURCE_KINDS,
  type Shipment,
  type ShipmentDirection,
  type ShipmentEvent,
  type ShipmentItem,
  type ShipmentLabel,
  type ShipmentMutationResult,
  type ShipmentStatus,
  type ShippingConnection,
  type ShippingConnectionStatus,
  type ShippingPackage,
  type ShippingProviderCode,
  type ShippingQuoteOption,
  type ShippingQuoteSession,
  type ShippingQuoteStatus,
  type ShippingResource,
  type ShippingResourceKind,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const HANDLER_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const QUOTE_CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/;

function invalid(): never {
  throw new TypeError("shipping_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get !== undefined || descriptor.set !== undefined)) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
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

function finiteDecimal(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) invalid();
  if (Math.round(value * 1_000) !== value * 1_000) invalid();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function denseArray<T>(value: unknown, minimum: number, maximum: number, parser: (entry: unknown) => Readonly<T>): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) invalid();
  return freeze(value.map((entry) => parser(entry)) as T[]) as readonly T[];
}

function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalid();
}

function httpsUrl(value: unknown): string {
  const raw = text(value, 1, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    parsed.href !== raw
  ) invalid();
  return raw;
}

function parsePackage(value: unknown): Readonly<ShippingPackage> {
  const parsed = exact(value, ["heightCm", "widthCm", "depthCm", "weightKg"]);
  return freeze({
    heightCm: finiteDecimal(parsed.heightCm, 0.001, 10_000),
    widthCm: finiteDecimal(parsed.widthCm, 0.001, 10_000),
    depthCm: finiteDecimal(parsed.depthCm, 0.001, 10_000),
    weightKg: finiteDecimal(parsed.weightKg, 0.001, 10_000),
  } satisfies ShippingPackage);
}

function parseQuoteOption(value: unknown): Readonly<ShippingQuoteOption> {
  const parsed = exact(
    value,
    ["id", "handlerCode", "handlerName", "desiKg", "priceCents", "currency"],
    ["codFeeCents"],
  );
  if (parsed.currency !== "TRY") invalid();
  return freeze({
    id: uuid(parsed.id),
    handlerCode: text(parsed.handlerCode, 1, 64, HANDLER_CODE),
    handlerName: text(parsed.handlerName, 1, 160),
    desiKg: finiteDecimal(parsed.desiKg, 0, 10_000),
    priceCents: safeInteger(parsed.priceCents, 0),
    ...(Object.hasOwn(parsed, "codFeeCents") ? { codFeeCents: safeInteger(parsed.codFeeCents, 0) } : {}),
    currency: "TRY",
  } satisfies ShippingQuoteOption);
}

function parseShipmentItem(value: unknown): Readonly<ShipmentItem> {
  const parsed = exact(value, ["orderItemId", "productName", "quantity"]);
  return freeze({
    orderItemId: uuid(parsed.orderItemId),
    productName: text(parsed.productName, 1, 200),
    quantity: safeInteger(parsed.quantity, 1, 9_999),
  } satisfies ShipmentItem);
}

function parseShipmentEvent(value: unknown): Readonly<ShipmentEvent> {
  const parsed = exact(value, ["id", "status", "occurredAt"]);
  return freeze({
    id: uuid(parsed.id),
    status: enumValue<ShipmentStatus>(parsed.status, SHIPMENT_STATUSES),
    occurredAt: timestamp(parsed.occurredAt),
  } satisfies ShipmentEvent);
}

function parseShipmentLabel(value: unknown): ShipmentLabel {
  const base = record(value);
  if (base.available === false) {
    exact(base, ["available"]);
    return freeze({ available: false });
  }
  const parsed = exact(base, ["available", "version"]);
  if (parsed.available !== true) invalid();
  return freeze({ available: true, version: safeInteger(parsed.version, 1) });
}

export function parseShippingConnection(value: unknown): Readonly<ShippingConnection> {
  const parsed = exact(
    value,
    ["providerCode", "displayName", "status", "credentialVersion", "codDeliveredMarksPaid", "version"],
    ["selectedBrandLabel", "selectedAddressLabel", "verifiedAt"],
  );
  return freeze({
    providerCode: enumValue<ShippingProviderCode>(parsed.providerCode, SHIPPING_PROVIDER_CODES),
    displayName: text(parsed.displayName, 1, 100),
    status: enumValue<ShippingConnectionStatus>(parsed.status, SHIPPING_CONNECTION_STATUSES),
    credentialVersion: safeInteger(parsed.credentialVersion, 1),
    ...(Object.hasOwn(parsed, "selectedBrandLabel") ? { selectedBrandLabel: text(parsed.selectedBrandLabel, 1, 200) } : {}),
    ...(Object.hasOwn(parsed, "selectedAddressLabel") ? { selectedAddressLabel: text(parsed.selectedAddressLabel, 1, 200) } : {}),
    codDeliveredMarksPaid: boolean(parsed.codDeliveredMarksPaid),
    ...(Object.hasOwn(parsed, "verifiedAt") ? { verifiedAt: timestamp(parsed.verifiedAt) } : {}),
    version: safeInteger(parsed.version, 1),
  } satisfies ShippingConnection);
}

export function parseShippingResource(value: unknown): Readonly<ShippingResource> {
  const parsed = exact(value, ["id", "kind", "label", "active", "verifiedAt"]);
  return freeze({
    id: uuid(parsed.id),
    kind: enumValue<ShippingResourceKind>(parsed.kind, SHIPPING_RESOURCE_KINDS),
    label: text(parsed.label, 1, 200),
    active: boolean(parsed.active),
    verifiedAt: timestamp(parsed.verifiedAt),
  } satisfies ShippingResource);
}

export function parseShippingQuoteSession(value: unknown): Readonly<ShippingQuoteSession> {
  const parsed = exact(value, ["credential", "status", "expiresAt", "currency", "packages", "options"]);
  if (parsed.currency !== "TRY") invalid();
  const packages = denseArray(parsed.packages, 1, 20, parsePackage);
  const options = denseArray(parsed.options, 1, 100, parseQuoteOption);
  unique(options.map((option) => option.id));
  return freeze({
    credential: text(parsed.credential, 32, 512, QUOTE_CREDENTIAL),
    status: enumValue<ShippingQuoteStatus>(parsed.status, SHIPPING_QUOTE_STATUSES),
    expiresAt: timestamp(parsed.expiresAt),
    currency: "TRY",
    packages,
    options,
  } satisfies ShippingQuoteSession);
}

export function parseShipment(value: unknown): Readonly<Shipment> {
  const parsed = exact(
    value,
    [
      "id", "providerCode", "direction", "status", "codAmountCents", "currency", "items", "events",
      "label", "version", "createdAt", "updatedAt",
    ],
    ["carrier", "barcode", "trackingNumber", "trackingUrl", "priceCents"],
  );
  if (parsed.currency !== "TRY") invalid();
  const carrier = Object.hasOwn(parsed, "carrier") ? text(parsed.carrier, 1, 160) : undefined;
  const barcode = Object.hasOwn(parsed, "barcode") ? text(parsed.barcode, 1, 200) : undefined;
  const trackingNumber = Object.hasOwn(parsed, "trackingNumber") ? text(parsed.trackingNumber, 1, 200) : undefined;
  const trackingUrl = Object.hasOwn(parsed, "trackingUrl") ? httpsUrl(parsed.trackingUrl) : undefined;
  if ((carrier === undefined) !== (trackingNumber === undefined)) invalid();
  if (trackingUrl !== undefined && trackingNumber === undefined) invalid();
  const items = denseArray(parsed.items, 1, 100, parseShipmentItem);
  const events = denseArray(parsed.events, 0, 200, parseShipmentEvent);
  unique(items.map((item) => item.orderItemId));
  unique(events.map((event) => event.id));
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (comparableTimestamp(updatedAt) < comparableTimestamp(createdAt)) invalid();
  return freeze({
    id: uuid(parsed.id),
    providerCode: enumValue<ShippingProviderCode>(parsed.providerCode, SHIPPING_PROVIDER_CODES),
    direction: enumValue<ShipmentDirection>(parsed.direction, SHIPMENT_DIRECTIONS),
    status: enumValue<ShipmentStatus>(parsed.status, SHIPMENT_STATUSES),
    ...(carrier === undefined ? {} : { carrier }),
    ...(barcode === undefined ? {} : { barcode }),
    ...(trackingNumber === undefined ? {} : { trackingNumber }),
    ...(trackingUrl === undefined ? {} : { trackingUrl }),
    ...(Object.hasOwn(parsed, "priceCents") ? { priceCents: safeInteger(parsed.priceCents, 0) } : {}),
    codAmountCents: safeInteger(parsed.codAmountCents, 0),
    currency: "TRY",
    items,
    events,
    label: parseShipmentLabel(parsed.label),
    version: safeInteger(parsed.version, 1),
    createdAt,
    updatedAt,
  } satisfies Shipment);
}

export function parseShipmentMutationResult(value: unknown): Readonly<ShipmentMutationResult> {
  const parsed = exact(value, ["shipmentId", "status", "version", "updatedAt", "replayed"]);
  return freeze({
    shipmentId: uuid(parsed.shipmentId),
    status: enumValue<ShipmentStatus>(parsed.status, SHIPMENT_STATUSES),
    version: safeInteger(parsed.version, 1),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: boolean(parsed.replayed),
  } satisfies ShipmentMutationResult);
}
