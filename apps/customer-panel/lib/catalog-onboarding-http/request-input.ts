import "server-only";

import { parseCatalogCategoryFields, parseCatalogOnboardingIntent, type CatalogOnboardingIntent } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BODY_LIMIT = 131_072;
const INVALID = Object.freeze({ kind: "invalid" as const });

type Invalid = typeof INVALID;

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const parsed = object(value);
  return parsed !== null && Object.keys(parsed).sort().join(",") === [...keys].sort().join(",") ? parsed : null;
}

async function json(request: Request): Promise<unknown | null> {
  const mediaType = request.headers.get("content-type");
  if (
    mediaType === null || mediaType.includes(",")
    || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(mediaType)
    || request.headers.get("transfer-encoding") !== null || request.body === null
  ) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > BODY_LIMIT)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > BODY_LIMIT) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return null; }
}

function operation(request: Request): string | null {
  const selected = request.headers.get("idempotency-key");
  return selected !== null && UUID.test(selected) ? selected : null;
}

export async function readCatalogOnboardingCreateInput(request: Request): Promise<Invalid | Readonly<{ kind: "valid"; operationId: string; intent: CatalogOnboardingIntent }>> {
  const operationId = operation(request);
  const raw = await json(request);
  if (operationId === null || raw === null) return INVALID;
  try { return Object.freeze({ kind: "valid" as const, operationId, intent: parseCatalogOnboardingIntent(raw) }); }
  catch { return INVALID; }
}

export async function readCatalogMerchandisingUpdateInput(request: Request) {
  const operationId = operation(request);
  const raw = await json(request);
  const parsed = exact(raw, ["expectedProfileVersion", "profile", "categoryIds", "resourceIds", "channelIds"]);
  if (operationId === null || parsed === null || !Number.isSafeInteger(parsed.expectedProfileVersion) || (parsed.expectedProfileVersion as number) < 1) return INVALID;
  try {
    const synthetic = parseCatalogOnboardingIntent({
      kind: "advanced", productType: "physical", title: "Doğrulama ürünü", publish: false,
      variants: [{ title: "Standart", priceCents: 0, stockTracking: true, stockQuantity: 0, attributes: {}, continueSellingWhenOutOfStock: false, inventory: [] }],
      categoryIds: parsed.categoryIds, resourceIds: parsed.resourceIds, channelIds: parsed.channelIds, profile: parsed.profile,
    });
    if (synthetic.kind !== "advanced") return INVALID;
    return Object.freeze({
      kind: "valid" as const, operationId, expectedProfileVersion: parsed.expectedProfileVersion as number,
      profile: synthetic.profile, categoryIds: synthetic.categoryIds, resourceIds: synthetic.resourceIds, channelIds: synthetic.channelIds,
    });
  } catch { return INVALID; }
}

export async function readCatalogPublishAfterMediaInput(request: Request) {
  const operationId = operation(request);
  const parsed = exact(await json(request), ["expectedProductVersion", "expectedMediaCount"]);
  if (
    operationId === null || parsed === null
    || !Number.isSafeInteger(parsed.expectedProductVersion) || (parsed.expectedProductVersion as number) < 1
    || !Number.isSafeInteger(parsed.expectedMediaCount) || (parsed.expectedMediaCount as number) < 0 || (parsed.expectedMediaCount as number) > 16
  ) return INVALID;
  return Object.freeze({ kind: "valid" as const, operationId, expectedProductVersion: parsed.expectedProductVersion as number, expectedMediaCount: parsed.expectedMediaCount as number });
}

export function readCatalogOnboardingProductId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export async function readCatalogCategoryCreateInput(request: Request) {
  const operationId = operation(request);
  const raw = await json(request);
  if (operationId === null || raw === null) return INVALID;
  try { return Object.freeze({ kind: "valid" as const, operationId, fields: parseCatalogCategoryFields(raw) }); }
  catch { return INVALID; }
}

export async function readCatalogCategoryUpdateInput(request: Request) {
  const operationId = operation(request);
  const parsed = exact(await json(request), ["expectedVersion", "fields"]);
  if (operationId === null || parsed === null || !Number.isSafeInteger(parsed.expectedVersion) || (parsed.expectedVersion as number) < 1) return INVALID;
  try { return Object.freeze({ kind: "valid" as const, operationId, expectedVersion: parsed.expectedVersion as number, fields: parseCatalogCategoryFields(parsed.fields) }); }
  catch { return INVALID; }
}

export async function readCatalogCategoryArchiveInput(request: Request) {
  const operationId = operation(request);
  const parsed = exact(await json(request), ["expectedVersion"]);
  if (operationId === null || parsed === null || !Number.isSafeInteger(parsed.expectedVersion) || (parsed.expectedVersion as number) < 1) return INVALID;
  return Object.freeze({ kind: "valid" as const, operationId, expectedVersion: parsed.expectedVersion as number });
}
