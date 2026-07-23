import type {
  InventoryBalance,
  InventoryCount,
  InventoryLocation,
  InventoryMutationResult,
  InventoryTransfer,
  PurchaseOrder,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface InventoryAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface ListInventoryBalancesInput extends InventoryAuthorityInput {
  readonly locationId: string;
}

export interface SaveInventoryLocationInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly locationId?: string;
  readonly expectedVersion?: number;
  readonly name: string;
}
export interface ArchiveInventoryLocationInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly locationId: string;
  readonly expectedVersion: number;
}
export interface RecoverInventoryLocationOperationInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly locationId: string;
  readonly expectedVersion: number;
  readonly expectedStatus: "active" | "archived";
}

export type ListPurchaseOrdersInput = InventoryAuthorityInput;
export interface GetPurchaseOrderInput extends InventoryAuthorityInput { readonly orderId: string }
export interface PurchaseOrderSaveLineInput {
  readonly lineId: string;
  readonly variantId: string;
  readonly orderedQuantity: number;
  readonly unitCostCents: number;
}
export interface SavePurchaseOrderInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly orderId?: string;
  readonly expectedVersion?: number;
  readonly locationId: string;
  readonly supplierName: string;
  readonly lines: readonly PurchaseOrderSaveLineInput[];
}
export interface TransitionPurchaseOrderInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly transition: "order" | "cancel";
}
export interface PurchaseOrderReceiptLineInput {
  readonly lineId: string;
  readonly quantity: number;
}
export interface ReceivePurchaseOrderInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly locationId: string;
  readonly lines: readonly PurchaseOrderReceiptLineInput[];
}

export type ListInventoryCountsInput = InventoryAuthorityInput;
export interface GetInventoryCountInput extends InventoryAuthorityInput { readonly countId: string }
export interface InventoryCountSaveLineInput {
  readonly lineId: string;
  readonly variantId: string;
  readonly countedQuantity?: number;
}
export interface SaveInventoryCountInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly countId?: string;
  readonly expectedVersion?: number;
  readonly locationId: string;
  readonly lines: readonly InventoryCountSaveLineInput[];
}
export interface InventoryCountOperationInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly countId: string;
  readonly expectedVersion: number;
}
export type StartInventoryCountInput = InventoryCountOperationInput;
export type CommitInventoryCountInput = InventoryCountOperationInput;
export type CancelInventoryCountInput = InventoryCountOperationInput;

export type ListInventoryTransfersInput = InventoryAuthorityInput;
export interface GetInventoryTransferInput extends InventoryAuthorityInput { readonly transferId: string }
export interface InventoryTransferSaveLineInput {
  readonly lineId: string;
  readonly variantId: string;
  readonly quantity: number;
}
export interface SaveInventoryTransferInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly transferId?: string;
  readonly expectedVersion?: number;
  readonly sourceLocationId: string;
  readonly destinationLocationId: string;
  readonly lines: readonly InventoryTransferSaveLineInput[];
}
export interface InventoryTransferOperationInput extends InventoryAuthorityInput {
  readonly operationId: string;
  readonly transferId: string;
  readonly expectedVersion: number;
}
export type DispatchInventoryTransferInput = InventoryTransferOperationInput;
export type ReceiveInventoryTransferInput = InventoryTransferOperationInput;
export type CancelInventoryTransferInput = InventoryTransferOperationInput;

export interface InventoryRepository {
  listLocations(input: InventoryAuthorityInput): Promise<readonly InventoryLocation[]>;
  saveLocation(input: SaveInventoryLocationInput): Promise<InventoryMutationResult>;
  archiveLocation(input: ArchiveInventoryLocationInput): Promise<InventoryMutationResult>;
  recoverLocationOperation(input: RecoverInventoryLocationOperationInput): Promise<InventoryMutationResult>;
  listBalances(input: ListInventoryBalancesInput): Promise<readonly InventoryBalance[]>;
  listPurchaseOrders(input: ListPurchaseOrdersInput): Promise<readonly PurchaseOrder[]>;
  getPurchaseOrder(input: GetPurchaseOrderInput): Promise<PurchaseOrder>;
  savePurchaseOrder(input: SavePurchaseOrderInput): Promise<InventoryMutationResult>;
  transitionPurchaseOrder(input: TransitionPurchaseOrderInput): Promise<InventoryMutationResult>;
  receivePurchaseOrder(input: ReceivePurchaseOrderInput): Promise<InventoryMutationResult>;
  listCounts(input: ListInventoryCountsInput): Promise<readonly InventoryCount[]>;
  getCount(input: GetInventoryCountInput): Promise<InventoryCount>;
  saveCount(input: SaveInventoryCountInput): Promise<InventoryMutationResult>;
  startCount(input: StartInventoryCountInput): Promise<InventoryMutationResult>;
  commitCount(input: CommitInventoryCountInput): Promise<InventoryMutationResult>;
  cancelCount(input: CancelInventoryCountInput): Promise<InventoryMutationResult>;
  listTransfers(input: ListInventoryTransfersInput): Promise<readonly InventoryTransfer[]>;
  getTransfer(input: GetInventoryTransferInput): Promise<InventoryTransfer>;
  saveTransfer(input: SaveInventoryTransferInput): Promise<InventoryMutationResult>;
  dispatchTransfer(input: DispatchInventoryTransferInput): Promise<InventoryMutationResult>;
  receiveTransfer(input: ReceiveInventoryTransferInput): Promise<InventoryMutationResult>;
  cancelTransfer(input: CancelInventoryTransferInput): Promise<InventoryMutationResult>;
}

export interface InventoryAuditEvent { readonly type: "inventory_commit_unknown" }
export interface PostgresInventoryRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: InventoryAuditEvent) => void | Promise<void>;
}
