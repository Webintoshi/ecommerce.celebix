export const INVENTORY_MOVEMENT_KINDS = Object.freeze([
  "opening",
  "catalog_adjustment",
  "purchase_receipt",
  "count_adjustment",
  "transfer_out",
  "transfer_in",
  "transfer_return",
  "checkout_sale",
] as const);
export type InventoryMovementKind = (typeof INVENTORY_MOVEMENT_KINDS)[number];

export const PURCHASE_ORDER_STATUSES = Object.freeze([
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const);
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const INVENTORY_COUNT_STATUSES = Object.freeze([
  "draft",
  "counting",
  "committed",
  "cancelled",
] as const);
export type InventoryCountStatus = (typeof INVENTORY_COUNT_STATUSES)[number];

export const INVENTORY_TRANSFER_STATUSES = Object.freeze([
  "draft",
  "in_transit",
  "received",
  "cancelled",
] as const);
export type InventoryTransferStatus = (typeof INVENTORY_TRANSFER_STATUSES)[number];

export interface InventoryLocation {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly status: "active" | "archived";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryBalance {
  readonly locationId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly version: number;
  readonly updatedAt: string;
}

export interface InventoryMovement {
  readonly id: string;
  readonly locationId: string;
  readonly variantId: string;
  readonly kind: InventoryMovementKind;
  readonly quantity: number;
  readonly occurredAt: string;
}

export interface PurchaseOrderLine {
  readonly id: string;
  readonly variantId: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly unitCostCents: number;
  readonly lineCostCents: number;
}

export interface PurchaseOrder {
  readonly id: string;
  readonly locationId: string;
  readonly supplierName: string;
  readonly status: PurchaseOrderStatus;
  readonly lines: readonly PurchaseOrderLine[];
  readonly totalCostCents: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryCountLine {
  readonly id: string;
  readonly variantId: string;
  readonly expectedQuantity: number;
  readonly countedQuantity?: number;
}

export interface InventoryCount {
  readonly id: string;
  readonly locationId: string;
  readonly status: InventoryCountStatus;
  readonly lines: readonly InventoryCountLine[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryTransferLine {
  readonly id: string;
  readonly variantId: string;
  readonly quantity: number;
}

export interface InventoryTransfer {
  readonly id: string;
  readonly sourceLocationId: string;
  readonly destinationLocationId: string;
  readonly status: InventoryTransferStatus;
  readonly lines: readonly InventoryTransferLine[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InventoryMutationResult {
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
