import { createHash } from "node:crypto";

import { promotionFailure } from "./errors.ts";

const UTF8 = new TextEncoder();
const SET_LIKE_KEYS = new Set([
  "include", "exclude", "referenceIds", "codes", "productIds", "items",
  "paymentMethodIds", "shippingMethodIds", "salesChannels", "benefitClasses",
  "customerSegmentIds", "customerTagIds", "cartLines", "categoryIds",
  "collectionIds", "submittedCodes",
]);

function byteCompare(left: string, right: string): number {
  const a = UTF8.encode(left), b = UTF8.encode(right), length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function canonical(value: unknown, parentKey: string | null = null, sortSets = true): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw promotionFailure("invalid_input");
    return String(value);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw promotionFailure("invalid_input");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw promotionFailure("invalid_input");
    const entries: Readonly<{ ordinal: number; serialized: string }>[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw promotionFailure("invalid_input");
      (entries as { ordinal: number; serialized: string }[]).push({ ordinal: index, serialized: canonical(descriptor.value, null, sortSets) });
    }
    const ordered = sortSets && SET_LIKE_KEYS.has(parentKey ?? "")
      ? [...entries].sort((left, right) => byteCompare(left.serialized, right.serialized) || left.ordinal - right.ordinal)
      : entries;
    return `[${ordered.map(({ serialized }) => serialized).join(",")}]`;
  }
  if (typeof value !== "object" || value === undefined) throw promotionFailure("invalid_input");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw promotionFailure("invalid_input");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: Array<Readonly<{ key: string; serialized: string }>> = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw promotionFailure("invalid_input");
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) throw promotionFailure("invalid_input");
    entries.push({ key, serialized: canonical(descriptor.value, key, sortSets) });
  }
  entries.sort((left, right) => byteCompare(left.key, right.key));
  return `{${entries.map(({ key, serialized }) => `${JSON.stringify(key)}:${serialized}`).join(",")}}`;
}

export type PromotionOperationKind =
  | "create" | "update" | "lifecycle" | "archive" | "duplicate"
  | "code_batch" | "code_batch_status";

export function promotionFingerprint(kind: PromotionOperationKind, storeId: string, payload: unknown): string {
  return createHash("sha256")
    .update(canonical({ kind, storeId, payload }), "utf8")
    .digest("hex");
}

export function equalPromotionProjection(left: unknown, right: unknown): boolean {
  try { return canonical(left, null, false) === canonical(right, null, false); } catch { return false; }
}

export function promotionCursorBinding(storeId: string, kind: string, query: unknown, anchor: unknown): string {
  return createHash("sha256")
    .update(canonical({ kind, storeId, query, anchor }), "utf8")
    .digest("hex");
}
