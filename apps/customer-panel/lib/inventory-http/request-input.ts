import type {
  InventoryCountSaveLineInput,
  InventoryTransferSaveLineInput,
  PurchaseOrderReceiptLineInput,
  PurchaseOrderSaveLineInput,
} from "@celebix/saas-data";

import type { InventoryRoute } from "./request-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BODY_MAXIMUM_BYTES = 131_072;
const INVALID = Object.freeze({ kind: "invalid" as const });
type Invalid = typeof INVALID;

export type InventoryMutationInput =
  | Readonly<{ kind: "purchase_save"; value: Readonly<{ operationId: string; orderId?: string; expectedVersion?: number; locationId: string; supplierName: string; lines: readonly PurchaseOrderSaveLineInput[] }> }>
  | Readonly<{ kind: "purchase_transition"; value: Readonly<{ operationId: string; expectedVersion: number; transition: "order" | "cancel" }> }>
  | Readonly<{ kind: "purchase_receive"; value: Readonly<{ operationId: string; expectedVersion: number; locationId: string; lines: readonly PurchaseOrderReceiptLineInput[] }> }>
  | Readonly<{ kind: "count_save"; value: Readonly<{ operationId: string; countId?: string; expectedVersion?: number; locationId: string; lines: readonly InventoryCountSaveLineInput[] }> }>
  | Readonly<{ kind: "count_start" | "count_commit" | "count_cancel"; value: Readonly<{ operationId: string; expectedVersion: number }> }>
  | Readonly<{ kind: "transfer_save"; value: Readonly<{ operationId: string; transferId?: string; expectedVersion?: number; sourceLocationId: string; destinationLocationId: string; lines: readonly InventoryTransferSaveLineInput[] }> }>
  | Readonly<{ kind: "transfer_dispatch" | "transfer_receive" | "transfer_cancel"; value: Readonly<{ operationId: string; expectedVersion: number }> }>;

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const parsed = object(value), allowed = new Set([...required, ...optional]);
  return !parsed || required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))
    ? null : parsed;
}
function id(value: unknown): string | null { return typeof value === "string" && UUID.test(value) ? value : null; }
function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) < Number.MAX_SAFE_INTEGER
    ? value as number : null;
}
function quantity(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= 2_147_483_647 ? value as number : null;
}
function money(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_000_000_000 ? value as number : null;
}
function text(value: unknown, minimum: number, maximum: number): string | null {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum &&
    value === value.trim() && !CONTROL.test(value) ? value : null;
}
function lines<T extends Readonly<{ lineId: string; variantId?: string }>>(
  value: unknown,
  parser: (entry: unknown) => T | null,
): readonly T[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) return null;
  const parsed = value.map(parser);
  if (parsed.some((line) => line === null)) return null;
  const safe = parsed as T[];
  if (
    new Set(safe.map((line) => line.lineId)).size !== safe.length ||
    new Set(safe.flatMap((line) => line.variantId ? [line.variantId] : [])).size !== safe.flatMap((line) => line.variantId ? [line.variantId] : []).length
  ) return null;
  return Object.freeze(safe);
}
function purchaseLine(value: unknown): PurchaseOrderSaveLineInput | null {
  const parsed = exact(value, ["lineId", "variantId", "orderedQuantity", "unitCostCents"]);
  const lineId = id(parsed?.lineId), variantId = id(parsed?.variantId), orderedQuantity = quantity(parsed?.orderedQuantity, 1), unitCostCents = money(parsed?.unitCostCents);
  if (!parsed || !lineId || !variantId || orderedQuantity === null || unitCostCents === null || orderedQuantity * unitCostCents > 8_000_000_000) return null;
  return Object.freeze({ lineId, variantId, orderedQuantity, unitCostCents });
}
function receiptLine(value: unknown): PurchaseOrderReceiptLineInput | null {
  const parsed = exact(value, ["lineId", "quantity"]), lineId = id(parsed?.lineId), selected = quantity(parsed?.quantity, 1);
  return parsed && lineId && selected !== null ? Object.freeze({ lineId, quantity: selected }) : null;
}
function countLine(value: unknown): InventoryCountSaveLineInput | null {
  const parsed = exact(value, ["lineId", "variantId"], ["countedQuantity"]);
  const lineId = id(parsed?.lineId), variantId = id(parsed?.variantId);
  const countedQuantity = parsed && Object.hasOwn(parsed, "countedQuantity") ? quantity(parsed.countedQuantity, 0) : undefined;
  return parsed && lineId && variantId && countedQuantity !== null
    ? Object.freeze({ lineId, variantId, ...(countedQuantity === undefined ? {} : { countedQuantity }) }) : null;
}
function transferLine(value: unknown): InventoryTransferSaveLineInput | null {
  const parsed = exact(value, ["lineId", "variantId", "quantity"]);
  const lineId = id(parsed?.lineId), variantId = id(parsed?.variantId), selected = quantity(parsed?.quantity, 1);
  return parsed && lineId && variantId && selected !== null ? Object.freeze({ lineId, variantId, quantity: selected }) : null;
}

async function json(request: Request): Promise<unknown | null> {
  if (
    request.headers.get("content-type") !== "application/json" ||
    request.headers.get("transfer-encoding") !== null || request.body === null
  ) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > BODY_MAXIMUM_BYTES)) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > BODY_MAXIMUM_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (!total || (declared !== null && Number(declared) !== total)) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}

export function readInventoryGetInput(request: Request, route: InventoryRoute): Invalid | Readonly<{ kind: "valid"; locationId?: string }> {
  try {
    if (
      request.body !== null || request.headers.get("content-type") !== null ||
      request.headers.get("content-length") !== null || request.headers.get("transfer-encoding") !== null
    ) return INVALID;
    const url = new URL(request.url);
    if (route.kind !== "balances") return url.search === "" ? Object.freeze({ kind: "valid" as const }) : INVALID;
    const match = new RegExp(`^\\?locationId=(${UUID.source.slice(1, -1)})$`).exec(url.search);
    return match ? Object.freeze({ kind: "valid" as const, locationId: match[1]! }) : INVALID;
  } catch { return INVALID; }
}

export async function readInventoryMutationInput(request: Request, route: InventoryRoute): Promise<Invalid | InventoryMutationInput> {
  const raw = await json(request);
  if (raw === null || route.method !== "POST") return INVALID;
  if (route.kind === "purchase_save") {
    const parsed = exact(raw, ["operationId", "locationId", "supplierName", "lines"], ["orderId", "expectedVersion"]);
    const operationId = id(parsed?.operationId), orderId = parsed?.orderId === undefined ? undefined : id(parsed.orderId), expectedVersion = parsed?.expectedVersion === undefined ? undefined : version(parsed.expectedVersion), locationId = id(parsed?.locationId), supplierName = text(parsed?.supplierName, 1, 200), selectedLines = lines(parsed?.lines, purchaseLine);
    if (
      !parsed || !operationId || !locationId || !supplierName || !selectedLines ||
      selectedLines.reduce((total, line) => total + line.orderedQuantity * line.unitCostCents, 0) > 8_000_000_000 ||
      (orderId === undefined) !== (expectedVersion === undefined) || orderId === null || expectedVersion === null
    ) return INVALID;
    return Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, ...(orderId ? { orderId, expectedVersion: expectedVersion! } : {}), locationId, supplierName, lines: selectedLines }) });
  }
  if (route.kind === "purchase_transition") {
    const parsed = exact(raw, ["operationId", "expectedVersion", "transition"]), operationId = id(parsed?.operationId), expectedVersion = version(parsed?.expectedVersion);
    return parsed && operationId && expectedVersion && (parsed.transition === "order" || parsed.transition === "cancel")
      ? Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, expectedVersion, transition: parsed.transition }) }) : INVALID;
  }
  if (route.kind === "purchase_receive") {
    const parsed = exact(raw, ["operationId", "expectedVersion", "locationId", "lines"]), operationId = id(parsed?.operationId), expectedVersion = version(parsed?.expectedVersion), locationId = id(parsed?.locationId), selectedLines = lines(parsed?.lines, receiptLine);
    return parsed && operationId && expectedVersion && locationId && selectedLines
      ? Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, expectedVersion, locationId, lines: selectedLines }) }) : INVALID;
  }
  if (route.kind === "count_save") {
    const parsed = exact(raw, ["operationId", "locationId", "lines"], ["countId", "expectedVersion"]);
    const operationId = id(parsed?.operationId), countId = parsed?.countId === undefined ? undefined : id(parsed.countId), expectedVersion = parsed?.expectedVersion === undefined ? undefined : version(parsed.expectedVersion), locationId = id(parsed?.locationId), selectedLines = lines(parsed?.lines, countLine);
    if (!parsed || !operationId || !locationId || !selectedLines || (countId === undefined) !== (expectedVersion === undefined) || countId === null || expectedVersion === null) return INVALID;
    return Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, ...(countId ? { countId, expectedVersion: expectedVersion! } : {}), locationId, lines: selectedLines }) });
  }
  if (route.kind === "transfer_save") {
    const parsed = exact(raw, ["operationId", "sourceLocationId", "destinationLocationId", "lines"], ["transferId", "expectedVersion"]);
    const operationId = id(parsed?.operationId), transferId = parsed?.transferId === undefined ? undefined : id(parsed.transferId), expectedVersion = parsed?.expectedVersion === undefined ? undefined : version(parsed.expectedVersion), sourceLocationId = id(parsed?.sourceLocationId), destinationLocationId = id(parsed?.destinationLocationId), selectedLines = lines(parsed?.lines, transferLine);
    if (!parsed || !operationId || !sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId || !selectedLines || (transferId === undefined) !== (expectedVersion === undefined) || transferId === null || expectedVersion === null) return INVALID;
    return Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, ...(transferId ? { transferId, expectedVersion: expectedVersion! } : {}), sourceLocationId, destinationLocationId, lines: selectedLines }) });
  }
  const parsed = exact(raw, ["operationId", "expectedVersion"]), operationId = id(parsed?.operationId), expectedVersion = version(parsed?.expectedVersion);
  return parsed && operationId && expectedVersion
    ? Object.freeze({ kind: route.kind, value: Object.freeze({ operationId, expectedVersion }) }) as InventoryMutationInput
    : INVALID;
}
