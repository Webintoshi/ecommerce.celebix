import {
  PRICE_CHANNELS,
  PRICE_LIST_STATUSES,
  PRICE_SOURCE_KINDS,
  type EffectivePrice,
  type PriceList,
  type PriceListItem,
  type PriceListRule,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_PRICE_CENTS = 8_000_000_000;

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("pricing_contract_invalid");
}

function guarded<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalid();
  }
}

function record(value: unknown): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value;
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): InputRecord {
  const descriptors = Object.getOwnPropertyDescriptors(record(value));
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string"
    || value.length < min
    || value.length > max
    || value !== value.trim()
    || CONTROL.test(value)
  ) invalid();
  return value;
}

function uuid(value: unknown): string {
  const parsed = text(value, 36, 36);
  if (!UUID.test(parsed)) invalid();
  return parsed;
}

function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid();
  return value as number;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  const normalized = value.replace(/(\.\d{3})Z$/, "$1000Z");
  const milliseconds = normalized.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== milliseconds) invalid();
  return normalized;
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function denseArray<T>(
  value: unknown,
  min: number,
  max: number,
  parse: (entry: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    string | symbol,
    PropertyDescriptor | undefined
  >;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = integer(lengthDescriptor.value, min, max);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const output: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output.push(parse(descriptor.value));
  }
  return Object.freeze(output);
}

export function parsePriceListItem(value: unknown): PriceListItem {
  return guarded(() => {
    const parsed = exact(value, ["variantId", "priceCents"]);
    return freeze({
      variantId: uuid(parsed.variantId),
      priceCents: integer(parsed.priceCents, 0, MAX_PRICE_CENTS),
    } satisfies PriceListItem);
  });
}

export function parsePriceListRule(value: unknown): PriceListRule {
  return guarded(() => {
    const parsed = exact(
      value,
      ["channel", "priority"],
      ["customerTagId", "startsAt", "endsAt"],
    );
    if (
      typeof parsed.channel !== "string"
      || !PRICE_CHANNELS.includes(parsed.channel as never)
    ) invalid();
    const startsAt = Object.hasOwn(parsed, "startsAt")
      ? timestamp(parsed.startsAt)
      : undefined;
    const endsAt = Object.hasOwn(parsed, "endsAt") && parsed.endsAt !== null
      ? timestamp(parsed.endsAt)
      : undefined;
    if ((endsAt !== undefined && startsAt === undefined) || (endsAt !== undefined && endsAt <= startsAt!)) invalid();
    return freeze({
      channel: parsed.channel as PriceListRule["channel"],
      ...(Object.hasOwn(parsed, "customerTagId")
        ? { customerTagId: uuid(parsed.customerTagId) }
        : {}),
      ...(startsAt === undefined ? {} : { startsAt }),
      ...(endsAt === undefined ? {} : { endsAt }),
      priority: integer(parsed.priority, 0, 1000),
    } satisfies PriceListRule);
  });
}

export function parsePriceList(value: unknown): PriceList {
  return guarded(() => {
    const parsed = exact(
      value,
      ["id", "name", "status", "items", "rules", "version", "createdAt", "updatedAt"],
      ["activatedAt", "archivedAt"],
    );
    if (
      typeof parsed.status !== "string"
      || !PRICE_LIST_STATUSES.includes(parsed.status as never)
    ) invalid();
    const items = denseArray(parsed.items, 1, 500, parsePriceListItem);
    const rules = denseArray(parsed.rules, 1, 100, parsePriceListRule);
    const variantIds = items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) invalid();
    const createdAt = timestamp(parsed.createdAt);
    const updatedAt = timestamp(parsed.updatedAt);
    if (updatedAt < createdAt) invalid();
    const activatedAt = Object.hasOwn(parsed, "activatedAt")
      ? timestamp(parsed.activatedAt)
      : undefined;
    const archivedAt = Object.hasOwn(parsed, "archivedAt")
      ? timestamp(parsed.archivedAt)
      : undefined;
    if (
      (activatedAt !== undefined && (activatedAt < createdAt || activatedAt > updatedAt))
      || (archivedAt !== undefined && (archivedAt < createdAt || archivedAt > updatedAt))
      || (activatedAt !== undefined && archivedAt !== undefined && archivedAt < activatedAt)
      || (parsed.status === "draft" && (activatedAt !== undefined || archivedAt !== undefined))
      || (parsed.status === "active" && (activatedAt === undefined || archivedAt !== undefined))
      || (parsed.status === "archived" && archivedAt === undefined)
    ) invalid();
    return freeze({
      id: uuid(parsed.id),
      name: text(parsed.name, 1, 200),
      status: parsed.status as PriceList["status"],
      items,
      rules,
      version: integer(parsed.version, 1, Number.MAX_SAFE_INTEGER),
      createdAt,
      updatedAt,
      ...(activatedAt === undefined ? {} : { activatedAt }),
      ...(archivedAt === undefined ? {} : { archivedAt }),
    } satisfies PriceList);
  });
}

export function parseEffectivePrice(value: unknown): EffectivePrice {
  return guarded(() => {
    const parsed = exact(
      value,
      ["variantId", "channel", "priceCents", "sourceKind"],
      ["priceListId"],
    );
    if (
      typeof parsed.channel !== "string"
      || !PRICE_CHANNELS.includes(parsed.channel as never)
      || typeof parsed.sourceKind !== "string"
      || !PRICE_SOURCE_KINDS.includes(parsed.sourceKind as never)
    ) invalid();
    const hasPriceList = Object.hasOwn(parsed, "priceListId");
    if (
      (parsed.sourceKind === "price_list" && !hasPriceList)
      || (parsed.sourceKind === "base" && hasPriceList)
    ) invalid();
    return freeze({
      variantId: uuid(parsed.variantId),
      channel: parsed.channel as EffectivePrice["channel"],
      priceCents: integer(parsed.priceCents, 0, MAX_PRICE_CENTS),
      sourceKind: parsed.sourceKind as EffectivePrice["sourceKind"],
      ...(hasPriceList ? { priceListId: uuid(parsed.priceListId) } : {}),
    } satisfies EffectivePrice);
  });
}
