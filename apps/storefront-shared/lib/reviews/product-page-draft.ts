import { parseReviewSubmission, type ReviewSubmission } from "@celebix/saas-contracts";

export const REVIEW_DRAFT_TTL_MS = 30 * 60 * 1000;

export type ReviewDraftFields = Readonly<{
  reviewerName: string;
  title: string;
  body: string;
  rating: number;
}>;
export type ProductReviewDraft = Readonly<{
  version: 1;
  productId: string;
  returnTo: string;
  savedAt: number;
  fields: ReviewDraftFields;
  pending: null | Readonly<{
    operationId: string;
    review: ReviewSubmission;
    phase: "awaiting-auth" | "sending" | "uncertain";
  }>;
}>;

const STORAGE_PREFIX = "celebix_product_review_draft_v1:";
const MAXIMUM_STORED_LENGTH = 32_768;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRODUCT_PATH = /^\/(?:urun|products)\/[A-Za-z0-9_-]+$/u;
const INVALID_FIELD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function invalid(): never { throw new TypeError("product_review_draft_invalid"); }

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)) || Object.values(descriptors).some(descriptor => descriptor.get || descriptor.set || !descriptor.enumerable)) invalid();
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function productPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || !PRODUCT_PATH.test(value)) invalid();
  return value;
}

function field(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length > maximumLength || INVALID_FIELD_CONTROL.test(value)) invalid();
  return value;
}

function parseDraft(value: unknown, productId: string, returnTo: string, now: number): ProductReviewDraft {
  const row = object(value, ["version", "productId", "returnTo", "savedAt", "fields", "pending"]);
  if (row.version !== 1 || uuid(row.productId) !== productId || productPath(row.returnTo) !== returnTo || !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(row.savedAt) || (row.savedAt as number) < 0 || (row.savedAt as number) > now || now - (row.savedAt as number) >= REVIEW_DRAFT_TTL_MS) invalid();
  const rawFields = object(row.fields, ["reviewerName", "title", "body", "rating"]);
  if (!Number.isSafeInteger(rawFields.rating) || (rawFields.rating as number) < 0 || (rawFields.rating as number) > 5) invalid();
  const fields: ReviewDraftFields = Object.freeze({
    reviewerName: field(rawFields.reviewerName, 120),
    title: field(rawFields.title, 200),
    body: field(rawFields.body, 2000),
    rating: rawFields.rating as number,
  });
  let pending: ProductReviewDraft["pending"] = null;
  if (row.pending !== null) {
    const intent = object(row.pending, ["operationId", "review", "phase"]);
    const operationId = uuid(intent.operationId);
    if (intent.phase !== "awaiting-auth" && intent.phase !== "sending" && intent.phase !== "uncertain") invalid();
    const review = parseReviewSubmission(intent.review);
    if (review.reviewerName !== fields.reviewerName.trim() || review.rating !== fields.rating || review.body !== fields.body.trim().replace(/\s+/gu, " ") || review.title !== (fields.title.trim() || undefined)) invalid();
    pending = Object.freeze({ operationId, review, phase: intent.phase });
  }
  return Object.freeze({ version: 1, productId, returnTo, savedAt: row.savedAt as number, fields, pending });
}

export function readProductReviewDraft(
  storage: Pick<Storage, "getItem" | "removeItem">,
  productId: string,
  returnTo: string,
  now = Date.now(),
): ProductReviewDraft | null {
  let key: string;
  try { key = `${STORAGE_PREFIX}${uuid(productId)}`; productPath(returnTo); }
  catch { return null; }
  let stored: string | null;
  try { stored = storage.getItem(key); }
  catch { return null; }
  if (stored === null) return null;
  try {
    if (stored.length > MAXIMUM_STORED_LENGTH) invalid();
    return parseDraft(JSON.parse(stored), productId, returnTo, now);
  } catch {
    try { storage.removeItem(key); } catch {}
    return null;
  }
}

export function writeProductReviewDraft(
  storage: Pick<Storage, "getItem" | "setItem">,
  draft: ProductReviewDraft,
): boolean {
  try {
    const row = object(draft, ["version", "productId", "returnTo", "savedAt", "fields", "pending"]);
    const productId = uuid(row.productId), returnTo = productPath(row.returnTo);
    const parsed = parseDraft(row, productId, returnTo, Date.now());
    const serialized = JSON.stringify(parsed);
    if (serialized.length > MAXIMUM_STORED_LENGTH) return false;
    const key = `${STORAGE_PREFIX}${productId}`;
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch { return false; }
}

export function clearProductReviewDraft(storage: Pick<Storage, "removeItem">, productId: string): boolean {
  try { storage.removeItem(`${STORAGE_PREFIX}${uuid(productId)}`); return true; }
  catch { return false; }
}
