import {
  INVENTORY_COUNT_STATUSES,
  INVENTORY_MOVEMENT_KINDS,
  INVENTORY_TRANSFER_STATUSES,
  PURCHASE_ORDER_STATUSES,
  type InventoryBalance,
  type InventoryCount,
  type InventoryCountLine,
  type InventoryLocation,
  type InventoryMovement,
  type InventoryMutationResult,
  type InventoryTransfer,
  type InventoryTransferLine,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_QUANTITY = 2_147_483_647;
const MAX_MONEY_CENTS = 8_000_000_000;

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never { throw new TypeError("inventory_contract_invalid"); }
function guarded<T>(parse: () => T): T { try { return parse(); } catch { return invalid(); } }
function record(value: unknown): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  const descriptors = Object.getOwnPropertyDescriptors(record(value));
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
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
  if (typeof value !== "string" || value.length < min || value.length > max || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}
function uuid(value: unknown): string { const result = text(value, 36, 36); if (!UUID.test(result)) invalid(); return result; }
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  const milliseconds = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== milliseconds) invalid();
  return value;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid();
  return value as number;
}
function quantity(value: unknown, min = 0): number { return integer(value, min, MAX_QUANTITY); }
function money(value: unknown): number { return integer(value, 0, MAX_MONEY_CENTS); }
function freeze<T>(value: T): T { if (typeof value === "object" && value !== null && !Object.isFrozen(value)) { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); } return value; }
function lines<T>(value: unknown, parse: (entry: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 500) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (Reflect.ownKeys(descriptors).length !== value.length + 1 || !lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    result.push(parse(descriptor.value));
  }
  const ids = result.map((line) => (line as { id: string }).id);
  if (new Set(ids).size !== ids.length) invalid();
  return Object.freeze(result);
}
function dateOrder(createdAt: string, updatedAt: string): void { if (updatedAt < createdAt) invalid(); }

export function parseInventoryLocation(value: unknown): InventoryLocation { return guarded(() => {
  const parsed = exact(value, ["id", "name", "isDefault", "status", "version", "createdAt", "updatedAt"]);
  if (typeof parsed.isDefault !== "boolean" || (parsed.status !== "active" && parsed.status !== "archived")) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt); dateOrder(createdAt, updatedAt);
  return freeze({ id: uuid(parsed.id), name: text(parsed.name, 1, 200), isDefault: parsed.isDefault, status: parsed.status, version: integer(parsed.version, 1), createdAt, updatedAt } satisfies InventoryLocation);
}); }
export function parseInventoryBalance(value: unknown): InventoryBalance { return guarded(() => {
  const parsed = exact(value, ["locationId", "variantId", "quantity", "version", "updatedAt"]);
  return freeze({ locationId: uuid(parsed.locationId), variantId: uuid(parsed.variantId), quantity: quantity(parsed.quantity), version: integer(parsed.version, 1), updatedAt: timestamp(parsed.updatedAt) } satisfies InventoryBalance);
}); }
export function parseInventoryMovement(value: unknown): InventoryMovement { return guarded(() => {
  const parsed = exact(value, ["id", "locationId", "variantId", "kind", "quantity", "occurredAt"]);
  if (typeof parsed.kind !== "string" || !INVENTORY_MOVEMENT_KINDS.includes(parsed.kind as never)) invalid();
  return freeze({ id: uuid(parsed.id), locationId: uuid(parsed.locationId), variantId: uuid(parsed.variantId), kind: parsed.kind as InventoryMovement["kind"], quantity: quantity(parsed.quantity, 1), occurredAt: timestamp(parsed.occurredAt) } satisfies InventoryMovement);
}); }
export function parsePurchaseOrderLine(value: unknown): PurchaseOrderLine { return guarded(() => {
  const parsed = exact(value, ["id", "variantId", "orderedQuantity", "receivedQuantity", "unitCostCents", "lineCostCents"]);
  const orderedQuantity = quantity(parsed.orderedQuantity, 1), receivedQuantity = quantity(parsed.receivedQuantity), unitCostCents = money(parsed.unitCostCents), lineCostCents = money(parsed.lineCostCents);
  if (receivedQuantity > orderedQuantity || orderedQuantity * unitCostCents > MAX_MONEY_CENTS || lineCostCents !== orderedQuantity * unitCostCents) invalid();
  return freeze({ id: uuid(parsed.id), variantId: uuid(parsed.variantId), orderedQuantity, receivedQuantity, unitCostCents, lineCostCents } satisfies PurchaseOrderLine);
}); }
export function parsePurchaseOrder(value: unknown): PurchaseOrder { return guarded(() => {
  const parsed = exact(value, ["id", "locationId", "supplierName", "status", "lines", "totalCostCents", "version", "createdAt", "updatedAt"]);
  if (typeof parsed.status !== "string" || !PURCHASE_ORDER_STATUSES.includes(parsed.status as never)) invalid();
  const parsedLines = lines(parsed.lines, parsePurchaseOrderLine), totalCostCents = money(parsed.totalCostCents), calculated = parsedLines.reduce((sum, line) => sum + line.lineCostCents, 0);
  if (!Number.isSafeInteger(calculated) || calculated > MAX_MONEY_CENTS || totalCostCents !== calculated) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt); dateOrder(createdAt, updatedAt);
  return freeze({ id: uuid(parsed.id), locationId: uuid(parsed.locationId), supplierName: text(parsed.supplierName, 1, 200), status: parsed.status as PurchaseOrder["status"], lines: parsedLines, totalCostCents, version: integer(parsed.version, 1), createdAt, updatedAt } satisfies PurchaseOrder);
}); }
export function parseInventoryCountLine(value: unknown): InventoryCountLine { return guarded(() => {
  const parsed = exact(value, ["id", "variantId", "expectedQuantity"], ["countedQuantity"]);
  return freeze({ id: uuid(parsed.id), variantId: uuid(parsed.variantId), expectedQuantity: quantity(parsed.expectedQuantity), ...(Object.hasOwn(parsed, "countedQuantity") ? { countedQuantity: quantity(parsed.countedQuantity) } : {}) } satisfies InventoryCountLine);
}); }
export function parseInventoryCount(value: unknown): InventoryCount { return guarded(() => {
  const parsed = exact(value, ["id", "locationId", "status", "lines", "version", "createdAt", "updatedAt"]);
  if (typeof parsed.status !== "string" || !INVENTORY_COUNT_STATUSES.includes(parsed.status as never)) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt); dateOrder(createdAt, updatedAt);
  return freeze({ id: uuid(parsed.id), locationId: uuid(parsed.locationId), status: parsed.status as InventoryCount["status"], lines: lines(parsed.lines, parseInventoryCountLine), version: integer(parsed.version, 1), createdAt, updatedAt } satisfies InventoryCount);
}); }
export function parseInventoryTransferLine(value: unknown): InventoryTransferLine { return guarded(() => {
  const parsed = exact(value, ["id", "variantId", "quantity"]);
  return freeze({ id: uuid(parsed.id), variantId: uuid(parsed.variantId), quantity: quantity(parsed.quantity, 1) } satisfies InventoryTransferLine);
}); }
export function parseInventoryTransfer(value: unknown): InventoryTransfer { return guarded(() => {
  const parsed = exact(value, ["id", "sourceLocationId", "destinationLocationId", "status", "lines", "version", "createdAt", "updatedAt"]);
  if (typeof parsed.status !== "string" || !INVENTORY_TRANSFER_STATUSES.includes(parsed.status as never)) invalid();
  const sourceLocationId = uuid(parsed.sourceLocationId), destinationLocationId = uuid(parsed.destinationLocationId); if (sourceLocationId === destinationLocationId) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt); dateOrder(createdAt, updatedAt);
  return freeze({ id: uuid(parsed.id), sourceLocationId, destinationLocationId, status: parsed.status as InventoryTransfer["status"], lines: lines(parsed.lines, parseInventoryTransferLine), version: integer(parsed.version, 1), createdAt, updatedAt } satisfies InventoryTransfer);
}); }
export function parseInventoryMutationResult(value: unknown): InventoryMutationResult { return guarded(() => {
  const parsed = exact(value, ["id", "status", "version", "updatedAt", "replayed"]);
  if (typeof parsed.replayed !== "boolean") invalid();
  return freeze({ id: uuid(parsed.id), status: text(parsed.status, 1, 32), version: integer(parsed.version, 1), updatedAt: timestamp(parsed.updatedAt), replayed: parsed.replayed } satisfies InventoryMutationResult);
}); }
