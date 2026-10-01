export type ProductVariantGalleryAssignment = Readonly<{ variantId: string; mediaIds: readonly string[] }>;
export type ProductVariantGallery = Readonly<{ productId: string; version: number; assignments: readonly ProductVariantGalleryAssignment[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid(): never { throw new TypeError("variant_gallery_invalid"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) invalid();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable) invalid();
    result[key] = descriptor.value;
  }
  return result;
}
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value as object);
  const length = descriptors.length.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const entries: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    entries.push(descriptor.value);
  }
  return entries;
}
function assignments(value: unknown, maximum: number): readonly ProductVariantGalleryAssignment[] {
  const seen = new Set<string>();
  return Object.freeze(denseArray(value, maximum).map(entry => {
    const parsed = record(entry, ["variantId", "mediaIds"]), variantId = uuid(parsed.variantId);
    if (seen.has(variantId)) invalid();
    seen.add(variantId);
    const mediaIds = denseArray(parsed.mediaIds, 16).map(uuid);
    if (new Set(mediaIds).size !== mediaIds.length) invalid();
    return Object.freeze({ variantId, mediaIds: Object.freeze(mediaIds) });
  }));
}
export function parseProductVariantGalleryAssignments(value: unknown): readonly ProductVariantGalleryAssignment[] {
  return assignments(value, 100);
}
export function parseProductVariantGallery(value: unknown): ProductVariantGallery {
  const parsed = record(value, ["productId", "version", "assignments"]);
  if (!Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) invalid();
  // A bounded update is a patch; reading the full product must retain earlier patches.
  return Object.freeze({ productId: uuid(parsed.productId), version: parsed.version as number, assignments: assignments(parsed.assignments, 5000) });
}
