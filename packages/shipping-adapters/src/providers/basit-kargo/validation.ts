import { types as utilTypes } from "node:util";

import type {
  CreateProviderShipmentInput,
  ProviderShipment,
  ProviderShippingHandler,
  ProviderShippingQuote,
  ProviderShippingResource,
} from "../../contracts.ts";
import {
  BASIT_KARGO_STATUSES,
  BASIT_KARGO_STATUS_MAP,
  type BasitKargoCredential,
  type BasitKargoStatus,
} from "./types.ts";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const TOKEN = /^[\x21-\x7e]{16,4096}$/;
const OPAQUE = /^[A-Za-z0-9_-]{1,200}$/;
const HANDLER = /^[A-Z][A-Z0-9_]{0,63}$/;

const HANDLER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  PTT: "PTT Kargo",
  MNG: "MNG Kargo",
  YURTICI: "Yurtiçi Kargo",
  ARAS: "Aras Kargo",
  SURAT: "Sürat Kargo",
  ECONOMIC: "En Ekonomik",
  FAST: "En Hızlı",
  SELF_PTT: "PTT Kargo",
  SELF_MNG: "MNG Kargo",
  SELF_YURTICI: "Yurtiçi Kargo",
  SELF_ARAS: "Aras Kargo",
  SELF_SURAT: "Sürat Kargo",
});

function invalidCredential(): never {
  throw new TypeError("basit_kargo_credential_invalid");
}

function invalidResponse(): never {
  throw new TypeError("basit_kargo_response_invalid");
}

function dataObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalidResponse();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    required.some((key) => !Object.hasOwn(descriptors, key)) ||
    keys.some((key) => typeof key !== "string" || (!required.includes(key) && !optional.includes(key)))
  ) invalidResponse();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalidResponse();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalidResponse();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalidResponse();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalidResponse();
    result.push(descriptor.value);
  }
  return result;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" || ENCODER.encode(value).byteLength < minimum || ENCODER.encode(value).byteLength > maximum ||
    CONTROL.test(value) || EDGE.test(value)
  ) invalidResponse();
  return value;
}

function opaque(value: unknown): string {
  const parsed = text(value, 1, 200);
  if (!OPAQUE.test(parsed)) invalidResponse();
  return parsed;
}

function handlerCode(value: unknown): string {
  const parsed = text(value, 1, 64);
  if (!HANDLER.test(parsed)) invalidResponse();
  return parsed;
}

function handlerName(code: string, providerName?: unknown): string {
  if (providerName !== undefined) return text(providerName, 1, 160);
  return HANDLER_NAMES[code] ?? code.replace(/^SELF_/u, "").replaceAll("_", " ");
}

function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) invalidResponse();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalidResponse();
  return value;
}

function nullableText(value: unknown, maximum = 2_048): string | null {
  if (value === null) return null;
  return text(value, 1, maximum);
}

function majorToCents(value: unknown): number {
  const amount = finite(value, 0, Number.MAX_SAFE_INTEGER / 100);
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents / 100 - amount) > Number.EPSILON * Math.max(1, amount) * 4) invalidResponse();
  return cents;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value) && !(value instanceof Uint8Array)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function parseBasitKargoCredential(value: unknown): BasitKargoCredential {
  try {
    const parsed = dataObject(value, ["token"]);
    if (typeof parsed.token !== "string" || !TOKEN.test(parsed.token)) invalidCredential();
    return Object.freeze({ token: parsed.token });
  } catch (error) {
    if (error instanceof TypeError && error.message === "basit_kargo_credential_invalid") throw error;
    return invalidCredential();
  }
}

export function mapBasitKargoStatus(value: BasitKargoStatus): ProviderShipment["status"] {
  if (!BASIT_KARGO_STATUSES.includes(value)) invalidResponse();
  return BASIT_KARGO_STATUS_MAP[value];
}

export function parseBasitKargoJson(bytes: Uint8Array): unknown {
  try {
    const textValue = DECODER.decode(bytes);
    if (textValue.length === 0 || textValue.charCodeAt(0) === 0xfeff) invalidResponse();
    return JSON.parse(textValue) as unknown;
  } catch (error) {
    if (error instanceof TypeError && error.message === "basit_kargo_response_invalid") throw error;
    return invalidResponse();
  }
}

export function parseBasitKargoHandlers(value: unknown): readonly ProviderShippingHandler[] {
  const handlers = denseArray(value, 1, 100).map((entry) => {
    const row = dataObject(entry, ["name", "code", "logo"]);
    nullableText(row.logo);
    const code = handlerCode(row.code);
    return freeze({ handlerCode: code, handlerName: handlerName(code, row.name), active: true });
  });
  if (new Set(handlers.map((entry) => entry.handlerCode)).size !== handlers.length) invalidResponse();
  return freeze(handlers);
}

export function parseBasitKargoBrands(value: unknown): readonly ProviderShippingResource[] {
  const resources = denseArray(value, 0, 100).map((entry) => {
    const row = dataObject(entry, ["id", "name", "status", "logo", "website", "instagram", "createdAt"]);
    nullableText(row.logo);
    nullableText(row.website);
    nullableText(row.instagram, 200);
    text(row.createdAt, 19, 32);
    const status = text(row.status, 1, 40);
    return freeze({ providerResourceId: opaque(row.id), label: text(row.name, 1, 200), active: status === "APPROVED" });
  });
  if (new Set(resources.map((entry) => entry.providerResourceId)).size !== resources.length) invalidResponse();
  return freeze(resources);
}

export function parseBasitKargoAddresses(value: unknown): readonly ProviderShippingResource[] {
  const resources = denseArray(value, 0, 100).map((entry) => {
    const row = dataObject(entry, ["id", "name", "phone", "city", "town", "address", "type", "createdTime"]);
    text(row.phone, 1, 32);
    text(row.city, 1, 160);
    text(row.town, 1, 160);
    text(row.address, 1, 500);
    text(row.createdTime, 19, 32);
    const type = text(row.type, 1, 40);
    return freeze({ providerResourceId: opaque(row.id), label: text(row.name, 1, 200), active: type === "SHIPPING" });
  });
  if (new Set(resources.map((entry) => entry.providerResourceId)).size !== resources.length) invalidResponse();
  return freeze(resources);
}

export function parseBasitKargoQuotes(value: unknown): readonly ProviderShippingQuote[] {
  const options = denseArray(value, 1, 100).map((entry) => {
    const row = dataObject(entry, ["desiKg", "handlerCode", "price"], ["codFee"]);
    const code = handlerCode(row.handlerCode);
    const codFee = Object.hasOwn(row, "codFee") && row.codFee !== null ? majorToCents(row.codFee) : undefined;
    return freeze({
      handlerCode: code,
      handlerName: handlerName(code),
      desiKg: finite(row.desiKg, 0, 10_000),
      priceCents: majorToCents(row.price),
      ...(codFee === undefined ? {} : { codFeeCents: codFee }),
      currency: "TRY" as const,
    });
  });
  if (new Set(options.map((entry) => entry.handlerCode)).size !== options.length) invalidResponse();
  return freeze(options);
}

export function parseBasitKargoShipment(value: unknown): ProviderShipment {
  const row = dataObject(
    value,
    ["id", "barcode", "type", "status", "validationFailed", "createdTime"],
    ["handler", "handlerShipmentCode", "priceInfo"],
  );
  if (boolean(row.validationFailed)) invalidResponse();
  text(row.createdTime, 19, 32);
  if (row.type !== "OUTGOING" && row.type !== "INCOMING") invalidResponse();
  if (typeof row.status !== "string" || !BASIT_KARGO_STATUSES.includes(row.status as BasitKargoStatus)) invalidResponse();
  const barcode = row.barcode === null ? undefined : opaque(row.barcode);
  let code: string | undefined;
  let name: string | undefined;
  if (Object.hasOwn(row, "handler")) {
    const handler = dataObject(row.handler, ["name", "code"]);
    code = handlerCode(handler.code);
    name = handlerName(code, handler.name);
  }
  const trackingNumber = Object.hasOwn(row, "handlerShipmentCode") && row.handlerShipmentCode !== null
    ? opaque(row.handlerShipmentCode)
    : undefined;
  let priceCents: number | undefined;
  if (Object.hasOwn(row, "priceInfo")) {
    const price = dataObject(row.priceInfo, ["shipmentFee", "totalCost"]);
    majorToCents(price.totalCost);
    priceCents = majorToCents(price.shipmentFee);
  }
  return freeze({
    providerReference: opaque(row.id),
    direction: row.type === "OUTGOING" ? "outgoing" : "incoming",
    status: mapBasitKargoStatus(row.status as BasitKargoStatus),
    providerStatus: row.status,
    ...(code === undefined ? {} : { handlerCode: code }),
    ...(name === undefined ? {} : { handlerName: name }),
    ...(barcode === undefined ? {} : { barcode }),
    ...(trackingNumber === undefined ? {} : { trackingNumber }),
    ...(priceCents === undefined ? {} : { priceCents }),
    currency: "TRY",
  });
}

function safeText(value: unknown, minimum: number, maximum: number): string {
  return text(value, minimum, maximum);
}

function safeInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalidResponse();
  return value as number;
}

function safePackage(value: unknown): Readonly<{ height: number; width: number; depth: number; weight: number }> {
  const row = dataObject(value, ["heightCm", "widthCm", "depthCm", "weightKg"]);
  return freeze({
    height: finite(row.heightCm, 0.001, 10_000),
    width: finite(row.widthCm, 0.001, 10_000),
    depth: finite(row.depthCm, 0.001, 10_000),
    weight: finite(row.weightKg, 0.001, 10_000),
  });
}

export function buildBasitKargoPackageBody(packages: unknown): readonly Readonly<Record<string, number>>[] {
  return freeze(denseArray(packages, 1, 20).map(safePackage));
}

export function buildBasitKargoCreateBody(input: CreateProviderShipmentInput<BasitKargoCredential>): Readonly<Record<string, unknown>> {
  const packages = buildBasitKargoPackageBody(input.packages);
  const items = denseArray(input.items, 1, 100).map((entry) => {
    const row = dataObject(entry, ["reference", "name", "quantity"]);
    return freeze({
      name: safeText(row.name, 1, 200),
      code: safeText(row.reference, 1, 128),
      quantity: String(safeInteger(row.quantity, 1, 9_999)),
    });
  });
  const recipient = dataObject(input.recipient, ["name", "phone", "city", "town", "address"]);
  const reference = safeText(input.reference, 1, 128);
  const codAmountCents = safeInteger(input.codAmountCents, 0, Number.MAX_SAFE_INTEGER);
  if (codAmountCents > 0 && input.codPaymentType !== "cash" && input.codPaymentType !== "credit_card") invalidResponse();
  return freeze({
    handlerCode: handlerCode(input.handlerCode),
    type: input.direction === "outgoing" ? "OUTGOING" : input.direction === "incoming" ? "INCOMING" : invalidResponse(),
    content: freeze({
      name: `Sipariş ${reference}`,
      code: reference,
      items: freeze(items),
      packages,
    }),
    client: freeze({
      name: safeText(recipient.name, 1, 200),
      phone: safeText(recipient.phone, 3, 32),
      city: safeText(recipient.city, 1, 160),
      town: safeText(recipient.town, 1, 160),
      address: safeText(recipient.address, 1, 500),
    }),
    ...(codAmountCents === 0 ? {} : {
      collect: codAmountCents / 100,
      collectOnDeliveryType: input.codPaymentType === "credit_card" ? "CREDIT_CARD" : "CASH",
    }),
    ...(input.addressId === undefined ? {} : { addressId: opaque(input.addressId) }),
    ...(input.brandId === undefined ? {} : { brandId: opaque(input.brandId) }),
  });
}

export function encodeBasitKargoJson(value: unknown): Uint8Array {
  try {
    return ENCODER.encode(JSON.stringify(value));
  } catch {
    return invalidResponse();
  }
}

export function parseBasitKargoSvg(bytes: Uint8Array): Uint8Array {
  let source: string;
  try {
    source = DECODER.decode(bytes);
  } catch {
    return invalidResponse();
  }
  if (
    !/^<svg(?:\s|>)/u.test(source) || !/<\/svg>$/u.test(source) ||
    /<(?:script|foreignObject|iframe|object|embed)(?:\s|>)/iu.test(source) ||
    /\son[a-z]+\s*=|\b(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/iu.test(source) ||
    /<!DOCTYPE|<!ENTITY/iu.test(source)
  ) invalidResponse();
  return Uint8Array.from(bytes);
}
