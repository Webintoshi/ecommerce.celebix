import {
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryLocation,
  parseInventoryMutationResult,
  parseInventoryTransfer,
  parsePurchaseOrder,
  type InventoryBalance,
  type InventoryCount,
  type InventoryLocation,
  type InventoryMutationResult,
  type InventoryTransfer,
  type PurchaseOrder,
} from "@celebix/saas-contracts";
import type {
  InventoryCountSaveLineInput,
  InventoryTransferSaveLineInput,
  PurchaseOrderReceiptLineInput,
  PurchaseOrderSaveLineInput,
} from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const RESPONSE_MAXIMUM_BYTES = 1_048_576;
const CODES = Object.freeze(["invalid_input", "conflict", "forbidden", "not_found", "unauthenticated", "method_not_allowed", "unavailable"] as const);
type InventoryApiErrorCode = (typeof CODES)[number];
type Fetch = typeof fetch;

export type SavePurchaseOrderIntent = Readonly<{
  orderId?: string;
  expectedVersion?: number;
  locationId: string;
  supplierName: string;
  lines: readonly PurchaseOrderSaveLineInput[];
}>;
export type ReceivePurchaseOrderIntent = Readonly<{
  expectedVersion: number;
  locationId: string;
  lines: readonly PurchaseOrderReceiptLineInput[];
}>;
export type SaveInventoryCountIntent = Readonly<{
  countId?: string;
  expectedVersion?: number;
  locationId: string;
  lines: readonly InventoryCountSaveLineInput[];
}>;
export type SaveInventoryTransferIntent = Readonly<{
  transferId?: string;
  expectedVersion?: number;
  sourceLocationId: string;
  destinationLocationId: string;
  lines: readonly InventoryTransferSaveLineInput[];
}>;

export class InventoryApiError extends Error {
  constructor(readonly code: InventoryApiErrorCode, readonly status: number) {
    super(code);
    this.name = "InventoryApiError";
  }
}

function invalid(): never { throw new TypeError("inventory_client_invalid"); }
function isAbortError(value: unknown): value is DOMException {
  try { return value instanceof DOMException && value.name === "AbortError"; }
  catch { return false; }
}
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const parsed = value as Record<string, unknown>, allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}
function id(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) invalid();
  return value as number;
}
function quantity(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > 2_147_483_647) invalid();
  return value as number;
}
function money(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 8_000_000_000) invalid();
  return value as number;
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" || value.length < minimum || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) invalid();
  return value;
}
function lineArray<T extends Readonly<{ lineId: string; variantId?: string }>>(
  value: unknown,
  parser: (entry: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) invalid();
  const lines = Object.freeze(value.map(parser));
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length) invalid();
  const variants = lines.flatMap((line) => line.variantId ? [line.variantId] : []);
  if (new Set(variants).size !== variants.length) invalid();
  return lines;
}
function purchaseLines(value: unknown): readonly PurchaseOrderSaveLineInput[] {
  let total = 0;
  return lineArray(value, (entry) => {
    const parsed = object(entry, ["lineId", "variantId", "orderedQuantity", "unitCostCents"]);
    const orderedQuantity = quantity(parsed.orderedQuantity, 1), unitCostCents = money(parsed.unitCostCents);
    total += orderedQuantity * unitCostCents;
    if (!Number.isSafeInteger(total) || total > 8_000_000_000) invalid();
    return Object.freeze({ lineId: id(parsed.lineId), variantId: id(parsed.variantId), orderedQuantity, unitCostCents });
  });
}
function receiptLines(value: unknown): readonly PurchaseOrderReceiptLineInput[] {
  return lineArray(value, (entry) => {
    const parsed = object(entry, ["lineId", "quantity"]);
    return Object.freeze({ lineId: id(parsed.lineId), quantity: quantity(parsed.quantity, 1) });
  });
}
function countLines(value: unknown): readonly InventoryCountSaveLineInput[] {
  return lineArray(value, (entry) => {
    const parsed = object(entry, ["lineId", "variantId"], ["countedQuantity"]);
    return Object.freeze({
      lineId: id(parsed.lineId), variantId: id(parsed.variantId),
      ...(Object.hasOwn(parsed, "countedQuantity") ? { countedQuantity: quantity(parsed.countedQuantity, 0) } : {}),
    });
  });
}
function transferLines(value: unknown): readonly InventoryTransferSaveLineInput[] {
  return lineArray(value, (entry) => {
    const parsed = object(entry, ["lineId", "variantId", "quantity"]);
    return Object.freeze({ lineId: id(parsed.lineId), variantId: id(parsed.variantId), quantity: quantity(parsed.quantity, 1) });
  });
}
function existing(parsed: Record<string, unknown>, key: "orderId" | "countId" | "transferId") {
  const target = parsed[key] === undefined ? undefined : id(parsed[key]);
  const expectedVersion = parsed.expectedVersion === undefined ? undefined : version(parsed.expectedVersion);
  if ((target === undefined) !== (expectedVersion === undefined)) invalid();
  return target ? { [key]: target, expectedVersion } : {};
}

async function readJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type") !== "application/json") throw new InventoryApiError("unavailable", 503);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > RESPONSE_MAXIMUM_BYTES)) {
    throw new InventoryApiError("unavailable", 503);
  }
  if (response.body === null) throw new InventoryApiError("unavailable", 503);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > RESPONSE_MAXIMUM_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new InventoryApiError("unavailable", 503);
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch (error) {
    if (error instanceof InventoryApiError) throw error;
    if (isAbortError(error)) throw error;
    throw new InventoryApiError("unavailable", 503);
  }
  if (!total || (declared !== null && Number(declared) !== total)) {
    throw new InventoryApiError("unavailable", 503);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new InventoryApiError("unavailable", 503); }
}
function apiError(value: unknown, status: number): InventoryApiError {
  try {
    const parsed = object(value, ["code"]);
    if (typeof parsed.code !== "string" || !CODES.includes(parsed.code as InventoryApiErrorCode)) throw new Error();
    const code = parsed.code as InventoryApiErrorCode;
    const expected = { invalid_input: 400, conflict: 409, forbidden: 403, not_found: 404, unauthenticated: 401, method_not_allowed: 405, unavailable: 503 }[code];
    return new InventoryApiError(status === expected ? code : "unavailable", status === expected ? status : 503);
  } catch { return new InventoryApiError("unavailable", 503); }
}
function items<T>(value: unknown, parser: (entry: unknown) => T): readonly T[] {
  const parsed = object(value, ["items"]);
  if (!Array.isArray(parsed.items) || parsed.items.length > 500) throw new InventoryApiError("unavailable", 503);
  try { return Object.freeze(parsed.items.map(parser)); } catch { throw new InventoryApiError("unavailable", 503); }
}
type MutationKind = "purchase_order" | "inventory_count" | "inventory_transfer";
function mutationResult(
  value: unknown,
  expected: Readonly<{
    kind: MutationKind;
    targetId?: string;
    expectedVersion?: number;
    statuses: readonly string[];
  }>,
): InventoryMutationResult {
  const parsed = object(value, ["kind", "id", "status", "version", "updatedAt", "replayed"]);
  if (parsed.kind !== expected.kind) invalid();
  const result = parseInventoryMutationResult({
    id: parsed.id,
    status: parsed.status,
    version: parsed.version,
    updatedAt: parsed.updatedAt,
    replayed: parsed.replayed,
  });
  if (
    (expected.targetId !== undefined && result.id !== expected.targetId) ||
    !expected.statuses.includes(result.status) ||
    result.version !== (expected.expectedVersion === undefined ? 1 : expected.expectedVersion + 1)
  ) invalid();
  return result;
}

export function createInventoryApi(fetcher: Fetch = fetch, uuid: () => string = () => crypto.randomUUID()) {
  if (typeof fetcher !== "function" || typeof uuid !== "function") invalid();
  async function request<T>(
    path: string,
    parser: (value: unknown) => T,
    init?: Readonly<{ body: unknown }>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      const response = await fetcher(path, {
        credentials: "same-origin",
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
        ...(init ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) } : {}),
      });
      const value = await readJson(response);
      if (!response.ok) throw apiError(value, response.status);
      try { return parser(value); } catch (error) {
        if (error instanceof InventoryApiError) throw error;
        throw new InventoryApiError("unavailable", 503);
      }
    } catch (error) {
      if (error instanceof InventoryApiError) throw error;
      if (isAbortError(error)) throw error;
      throw new InventoryApiError("unavailable", 503);
    }
  }
  function operation(): string { try { return id(uuid()); } catch { return invalid(); } }
  function post<T>(path: string, value: Record<string, unknown>, parser: (input: unknown) => T, signal?: AbortSignal) {
    return request(path, parser, { body: { operationId: operation(), ...value } }, signal);
  }
  function action(
    path: string,
    expectedVersion: number,
    expected: Readonly<{ kind: MutationKind; targetId: string; statuses: readonly string[] }>,
    signal?: AbortSignal,
  ) {
    const selectedVersion = version(expectedVersion);
    return post(path, { expectedVersion: selectedVersion }, (value) => mutationResult(value, {
      ...expected,
      expectedVersion: selectedVersion,
    }), signal);
  }

  return Object.freeze({
    listLocations(signal?: AbortSignal): Promise<readonly InventoryLocation[]> {
      return request("/api/inventory/locations", (value) => items(value, parseInventoryLocation), undefined, signal);
    },
    listBalances(locationId: string, signal?: AbortSignal): Promise<readonly InventoryBalance[]> {
      const selected = id(locationId);
      return request(`/api/inventory/balances?locationId=${selected}`, (value) => items(value, parseInventoryBalance), undefined, signal);
    },
    listPurchaseOrders(signal?: AbortSignal): Promise<readonly PurchaseOrder[]> {
      return request("/api/inventory/purchase-orders", (value) => items(value, parsePurchaseOrder), undefined, signal);
    },
    getPurchaseOrder(orderId: string, signal?: AbortSignal): Promise<PurchaseOrder> {
      return request(`/api/inventory/purchase-orders/${id(orderId)}`, parsePurchaseOrder, undefined, signal);
    },
    savePurchaseOrder(value: SavePurchaseOrderIntent, signal?: AbortSignal): Promise<InventoryMutationResult> {
      const parsed = object(value, ["locationId", "supplierName", "lines"], ["orderId", "expectedVersion"]);
      const prior = existing(parsed, "orderId");
      return post("/api/inventory/purchase-orders", {
        ...prior, locationId: id(parsed.locationId),
        supplierName: text(parsed.supplierName, 1, 200), lines: purchaseLines(parsed.lines),
      }, (result) => mutationResult(result, {
        kind: "purchase_order",
        ...((prior as { orderId?: string }).orderId ? {
          targetId: (prior as { orderId: string }).orderId,
          expectedVersion: (prior as { expectedVersion: number }).expectedVersion,
        } : {}),
        statuses: ["draft"],
      }), signal);
    },
    transitionPurchaseOrder(orderId: string, value: Readonly<{ expectedVersion: number; transition: "order" | "cancel" }>, signal?: AbortSignal) {
      const parsed = object(value, ["expectedVersion", "transition"]);
      if (parsed.transition !== "order" && parsed.transition !== "cancel") invalid();
      return post(`/api/inventory/purchase-orders/${id(orderId)}/transition`, {
        expectedVersion: version(parsed.expectedVersion), transition: parsed.transition,
      }, (result) => mutationResult(result, {
        kind: "purchase_order", targetId: id(orderId), expectedVersion: version(parsed.expectedVersion),
        statuses: [parsed.transition === "order" ? "ordered" : "cancelled"],
      }), signal);
    },
    receivePurchaseOrder(orderId: string, value: ReceivePurchaseOrderIntent, signal?: AbortSignal) {
      const parsed = object(value, ["expectedVersion", "locationId", "lines"]);
      return post(`/api/inventory/purchase-orders/${id(orderId)}/receive`, {
        expectedVersion: version(parsed.expectedVersion), locationId: id(parsed.locationId), lines: receiptLines(parsed.lines),
      }, (result) => mutationResult(result, {
        kind: "purchase_order", targetId: id(orderId), expectedVersion: version(parsed.expectedVersion),
        statuses: ["partially_received", "received"],
      }), signal);
    },
    listCounts(signal?: AbortSignal): Promise<readonly InventoryCount[]> {
      return request("/api/inventory/counts", (value) => items(value, parseInventoryCount), undefined, signal);
    },
    getCount(countId: string, signal?: AbortSignal): Promise<InventoryCount> {
      return request(`/api/inventory/counts/${id(countId)}`, parseInventoryCount, undefined, signal);
    },
    saveCount(value: SaveInventoryCountIntent, signal?: AbortSignal): Promise<InventoryMutationResult> {
      const parsed = object(value, ["locationId", "lines"], ["countId", "expectedVersion"]);
      const prior = existing(parsed, "countId");
      return post("/api/inventory/counts", {
        ...prior, locationId: id(parsed.locationId), lines: countLines(parsed.lines),
      }, (result) => mutationResult(result, {
        kind: "inventory_count",
        ...((prior as { countId?: string }).countId ? {
          targetId: (prior as { countId: string }).countId,
          expectedVersion: (prior as { expectedVersion: number }).expectedVersion,
        } : {}),
        statuses: (prior as { countId?: string }).countId ? ["draft", "counting"] : ["draft"],
      }), signal);
    },
    startCount(countId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(countId); return action(`/api/inventory/counts/${targetId}/start`, expectedVersion, { kind: "inventory_count", targetId, statuses: ["counting"] }, signal); },
    commitCount(countId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(countId); return action(`/api/inventory/counts/${targetId}/commit`, expectedVersion, { kind: "inventory_count", targetId, statuses: ["committed"] }, signal); },
    cancelCount(countId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(countId); return action(`/api/inventory/counts/${targetId}/cancel`, expectedVersion, { kind: "inventory_count", targetId, statuses: ["cancelled"] }, signal); },
    listTransfers(signal?: AbortSignal): Promise<readonly InventoryTransfer[]> {
      return request("/api/inventory/transfers", (value) => items(value, parseInventoryTransfer), undefined, signal);
    },
    getTransfer(transferId: string, signal?: AbortSignal): Promise<InventoryTransfer> {
      return request(`/api/inventory/transfers/${id(transferId)}`, parseInventoryTransfer, undefined, signal);
    },
    saveTransfer(value: SaveInventoryTransferIntent, signal?: AbortSignal): Promise<InventoryMutationResult> {
      const parsed = object(value, ["sourceLocationId", "destinationLocationId", "lines"], ["transferId", "expectedVersion"]);
      const sourceLocationId = id(parsed.sourceLocationId), destinationLocationId = id(parsed.destinationLocationId);
      if (sourceLocationId === destinationLocationId) invalid();
      const prior = existing(parsed, "transferId");
      return post("/api/inventory/transfers", {
        ...prior, sourceLocationId, destinationLocationId, lines: transferLines(parsed.lines),
      }, (result) => mutationResult(result, {
        kind: "inventory_transfer",
        ...((prior as { transferId?: string }).transferId ? {
          targetId: (prior as { transferId: string }).transferId,
          expectedVersion: (prior as { expectedVersion: number }).expectedVersion,
        } : {}),
        statuses: ["draft"],
      }), signal);
    },
    dispatchTransfer(transferId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(transferId); return action(`/api/inventory/transfers/${targetId}/dispatch`, expectedVersion, { kind: "inventory_transfer", targetId, statuses: ["in_transit"] }, signal); },
    receiveTransfer(transferId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(transferId); return action(`/api/inventory/transfers/${targetId}/receive`, expectedVersion, { kind: "inventory_transfer", targetId, statuses: ["received"] }, signal); },
    cancelTransfer(transferId: string, expectedVersion: number, signal?: AbortSignal) { const targetId = id(transferId); return action(`/api/inventory/transfers/${targetId}/cancel`, expectedVersion, { kind: "inventory_transfer", targetId, statuses: ["cancelled"] }, signal); },
  });
}

export const inventoryApi = createInventoryApi();
