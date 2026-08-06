import { types as utilTypes } from "node:util";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[\x21-\x7e]{16,4096}$/u;
const QUOTE_CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/u;
const MAXIMUM_BODY_BYTES = 16_384;

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}

export async function readShippingJsonBody(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let joined: Uint8Array | undefined;
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 2) return null;
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown;
  } catch { return null; }
  finally { joined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

function operation(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function parseSaveConnectionBody(value: unknown): Readonly<{ token: string; operationId: string }> | null {
  const parsed = exact(value, ["token", "operationId"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  if (!parsed || operationId === null || typeof parsed.token !== "string" || !TOKEN.test(parsed.token)) return null;
  return Object.freeze({ token: parsed.token, operationId });
}

export function parseSelectResourcesBody(value: unknown): Readonly<{
  operationId: string;
  brandResourceId: string;
  addressResourceId: string;
  codDeliveredMarksPaid: boolean;
}> | null {
  const parsed = exact(value, ["operationId", "brandResourceId", "addressResourceId", "codDeliveredMarksPaid"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  const brandResourceId = parsed ? operation(parsed.brandResourceId) : null;
  const addressResourceId = parsed ? operation(parsed.addressResourceId) : null;
  if (!parsed || operationId === null || brandResourceId === null || addressResourceId === null || typeof parsed.codDeliveredMarksPaid !== "boolean") return null;
  return Object.freeze({ operationId, brandResourceId, addressResourceId, codDeliveredMarksPaid: parsed.codDeliveredMarksPaid });
}

export function parseRevokeConnectionBody(value: unknown): Readonly<{ operationId: string }> | null {
  const parsed = exact(value, ["operationId"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  return parsed && operationId ? Object.freeze({ operationId }) : null;
}

function positiveDecimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.001 && value <= 10_000 ? value : null;
}

export function parseBeginQuoteBody(value: unknown): Readonly<{
  operationId: string;
  expectedOrderVersion: number;
  packages: readonly Readonly<{ heightCm: number; widthCm: number; depthCm: number; weightKg: number }>[];
}> | null {
  const parsed = exact(value, ["operationId", "expectedOrderVersion", "packages"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  if (!parsed || operationId === null || !Number.isSafeInteger(parsed.expectedOrderVersion) || Number(parsed.expectedOrderVersion) < 1 || !Array.isArray(parsed.packages) || parsed.packages.length < 1 || parsed.packages.length > 20) return null;
  const packages = [] as Array<Readonly<{ heightCm: number; widthCm: number; depthCm: number; weightKg: number }>>;
  for (const value of parsed.packages) {
    const item = exact(value, ["heightCm", "widthCm", "depthCm", "weightKg"]);
    const heightCm = item ? positiveDecimal(item.heightCm) : null;
    const widthCm = item ? positiveDecimal(item.widthCm) : null;
    const depthCm = item ? positiveDecimal(item.depthCm) : null;
    const weightKg = item ? positiveDecimal(item.weightKg) : null;
    if (!item || heightCm === null || widthCm === null || depthCm === null || weightKg === null) return null;
    packages.push(Object.freeze({ heightCm, widthCm, depthCm, weightKg }));
  }
  return Object.freeze({ operationId, expectedOrderVersion: Number(parsed.expectedOrderVersion), packages: Object.freeze(packages) });
}

export function parseBeginShipmentBody(value: unknown): Readonly<{
  operationId: string;
  expectedOrderVersion: number;
  quoteCredential: string;
  optionId: string;
}> | null {
  const parsed = exact(value, ["operationId", "expectedOrderVersion", "quoteCredential", "optionId"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  const optionId = parsed ? operation(parsed.optionId) : null;
  if (
    !parsed || operationId === null || optionId === null ||
    !Number.isSafeInteger(parsed.expectedOrderVersion) || Number(parsed.expectedOrderVersion) < 1 ||
    typeof parsed.quoteCredential !== "string" || !QUOTE_CREDENTIAL.test(parsed.quoteCredential)
  ) return null;
  return Object.freeze({
    operationId,
    expectedOrderVersion: Number(parsed.expectedOrderVersion),
    quoteCredential: parsed.quoteCredential,
    optionId,
  });
}

export function parseShipmentActionBody(value: unknown): Readonly<{ operationId: string; expectedShipmentVersion: number }> | null {
  const parsed = exact(value, ["operationId", "expectedShipmentVersion"]);
  const operationId = parsed ? operation(parsed.operationId) : null;
  if (!parsed || operationId === null || !Number.isSafeInteger(parsed.expectedShipmentVersion) || Number(parsed.expectedShipmentVersion) < 1) return null;
  return Object.freeze({ operationId, expectedShipmentVersion: Number(parsed.expectedShipmentVersion) });
}
