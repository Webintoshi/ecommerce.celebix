import type { InventoryCount, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";

import type {
  ReceivePurchaseOrderIntent,
  SaveInventoryCountIntent,
  SaveInventoryTransferIntent,
  SavePurchaseOrderIntent,
} from "./client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export type InventoryOperationDraftLine = Readonly<{
  lineId: string;
  variantId: string;
  quantity: string;
  unitCostCents: string;
}>;
export type InventoryOperationDraft = Readonly<{
  mode: "purchase" | "count" | "transfer";
  record?: PurchaseOrder | InventoryCount | InventoryTransfer;
  supplierName: string;
  locationId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  lines: readonly InventoryOperationDraftLine[];
}>;
type SaveIntent = SavePurchaseOrderIntent | SaveInventoryCountIntent | SaveInventoryTransferIntent;
type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; message: string }>;
type ChoiceAuthority = Readonly<{ locationIds: ReadonlySet<string>; variantIds: ReadonlySet<string> }>;

const fail = (message: string): Result<never> => Object.freeze({ ok: false, message });
const success = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
const integer = (value: string, minimum: number, maximum = 2_147_483_647) =>
  /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
function purchase(record: InventoryOperationDraft["record"]): record is PurchaseOrder {
  return record !== undefined && "supplierName" in record;
}
function count(record: InventoryOperationDraft["record"]): record is InventoryCount {
  return record !== undefined && "locationId" in record && !("supplierName" in record);
}
function transfer(record: InventoryOperationDraft["record"]): record is InventoryTransfer {
  return record !== undefined && "sourceLocationId" in record;
}

export function buildInventoryOperationIntent(
  draft: InventoryOperationDraft,
  choices: ChoiceAuthority,
): Result<SaveIntent> {
  try {
    if (!Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > 500) return fail("1 ile 500 arasında kalem ekleyin.");
    const lineIds = new Set<string>(), variantIds = new Set<string>();
    for (const line of draft.lines) {
      if (
        !UUID.test(line.lineId) || !UUID.test(line.variantId) || !choices.variantIds.has(line.variantId) ||
        lineIds.has(line.lineId) || variantIds.has(line.variantId)
      ) return fail("Her kalem için farklı ve etkin bir varyant seçin.");
      lineIds.add(line.lineId);
      variantIds.add(line.variantId);
    }
    if (draft.mode === "purchase") {
      if (draft.record && (!purchase(draft.record) || draft.record.status !== "draft")) return fail("Yalnız taslak satın alma siparişi düzenlenebilir.");
      if (
        draft.supplierName.length < 1 || draft.supplierName.length > 200 ||
        draft.supplierName !== draft.supplierName.trim() || CONTROL.test(draft.supplierName) ||
        !choices.locationIds.has(draft.locationId)
      ) return fail("Etkin konum ve geçerli tedarikçi adı seçin.");
      let total = 0;
      const lines = draft.lines.map((line) => {
        if (!integer(line.quantity, 1) || !integer(line.unitCostCents, 0, 8_000_000_000)) throw new TypeError();
        total += Number(line.quantity) * Number(line.unitCostCents);
        if (!Number.isSafeInteger(total) || total > 8_000_000_000) throw new TypeError();
        return Object.freeze({
          lineId: line.lineId, variantId: line.variantId,
          orderedQuantity: Number(line.quantity), unitCostCents: Number(line.unitCostCents),
        });
      });
      return success(Object.freeze({
        ...(purchase(draft.record) ? { orderId: draft.record.id, expectedVersion: draft.record.version } : {}),
        locationId: draft.locationId,
        supplierName: draft.supplierName,
        lines: Object.freeze(lines),
      }));
    }
    if (draft.mode === "count") {
      if (draft.record && (!count(draft.record) || draft.record.status !== "draft")) return fail("Yalnız taslak stok sayımı düzenlenebilir.");
      if (!choices.locationIds.has(draft.locationId) || draft.lines.some((line) => !integer(line.quantity, 0))) {
        return fail("Etkin konum ve sıfır veya daha büyük sayım miktarı girin.");
      }
      return success(Object.freeze({
        ...(count(draft.record) ? { countId: draft.record.id, expectedVersion: draft.record.version } : {}),
        locationId: draft.locationId,
        lines: Object.freeze(draft.lines.map((line) => Object.freeze({
          lineId: line.lineId, variantId: line.variantId, countedQuantity: Number(line.quantity),
        }))),
      }));
    }
    if (draft.mode !== "transfer") return fail("Envanter işlem türü geçersiz.");
    if (draft.record && (!transfer(draft.record) || draft.record.status !== "draft")) return fail("Yalnız taslak stok transferi düzenlenebilir.");
    if (
      !choices.locationIds.has(draft.sourceLocationId) ||
      !choices.locationIds.has(draft.destinationLocationId) ||
      draft.sourceLocationId === draft.destinationLocationId
    ) return fail("Kaynak ve hedef konum farklı olmalıdır.");
    if (draft.lines.some((line) => !integer(line.quantity, 1))) return fail("Her transfer kalemi için pozitif miktar girin.");
    return success(Object.freeze({
      ...(transfer(draft.record) ? { transferId: draft.record.id, expectedVersion: draft.record.version } : {}),
      sourceLocationId: draft.sourceLocationId,
      destinationLocationId: draft.destinationLocationId,
      lines: Object.freeze(draft.lines.map((line) => Object.freeze({
        lineId: line.lineId, variantId: line.variantId, quantity: Number(line.quantity),
      }))),
    }));
  } catch {
    return fail("Envanter formu güvenli biçimde doğrulanamadı.");
  }
}

export function prepareInventoryOperationSubmission(
  draft: InventoryOperationDraft,
  choices: ChoiceAuthority,
  randomUUID: () => string = () => crypto.randomUUID(),
): Result<SaveIntent> {
  try {
    return buildInventoryOperationIntent(Object.freeze({
      ...draft,
      lines: Object.freeze(draft.lines.map((line) => Object.freeze({
        ...line,
        lineId: line.lineId || randomUUID(),
      }))),
    }), choices);
  } catch {
    return fail("Envanter formu güvenli biçimde doğrulanamadı.");
  }
}

export function buildPurchaseReceiptIntent(
  record: PurchaseOrder,
  quantities: Readonly<Record<string, string>>,
): Result<ReceivePurchaseOrderIntent["lines"]> {
  try {
    if (record.status !== "ordered" && record.status !== "partially_received") return fail("Bu satın alma siparişi teslim almaya açık değil.");
    const lines: Array<{ lineId: string; quantity: number }> = [];
    for (const line of record.lines) {
      const remaining = line.orderedQuantity - line.receivedQuantity;
      if (remaining === 0) continue;
      const raw = quantities[line.id] ?? "0";
      if (!integer(raw, 0)) return fail("Teslim miktarlarını tam sayı olarak girin.");
      const quantity = Number(raw);
      if (quantity > remaining) return fail("Kalan miktardan fazla teslim alınamaz.");
      if (quantity > 0) lines.push(Object.freeze({ lineId: line.id, quantity }));
    }
    if (!lines.length) return fail("En az bir pozitif teslim miktarı girin.");
    return success(Object.freeze(lines));
  } catch {
    return fail("Teslim miktarları güvenli biçimde doğrulanamadı.");
  }
}

export function purchaseReceiptRevision(record: PurchaseOrder): string {
  return `${record.id}:${record.version}`;
}

export function initialPurchaseReceiptQuantities(record: PurchaseOrder): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(record.lines
    .filter((line) => line.receivedQuantity < line.orderedQuantity)
    .map((line) => [line.id, "0"])));
}
