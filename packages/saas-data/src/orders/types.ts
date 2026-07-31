import type {
  OrderAddress,
  OrderDashboardSummary,
  OrderDetail,
  OrderListItem,
  OrderNeighbors,
  OrderPaymentStatus,
  OrderSort,
  OrderStatus,
  OrderTracking,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface OrderAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface ListOrdersInput extends OrderAuthorityInput {
  readonly pageSize: number;
  readonly cursor?: string;
  readonly status?: OrderStatus;
  readonly search?: string;
  readonly sort?: OrderSort;
}

export interface GetOrderInput extends OrderAuthorityInput {
  readonly orderId: string;
}

export interface OrderOperationInput extends GetOrderInput {
  readonly operationId: string;
}

export interface TransitionOrderStatusInput extends OrderOperationInput {
  readonly expectedVersion: number;
  readonly nextStatus: OrderStatus;
}

export interface TransitionOrderPaymentInput extends OrderOperationInput {
  readonly expectedVersion: number;
  readonly nextPaymentStatus: OrderPaymentStatus;
}

export interface UpdateOrderShippingInput extends OrderOperationInput {
  readonly expectedVersion: number;
  readonly shippingAddress: Readonly<OrderAddress>;
  readonly tracking?: Readonly<OrderTracking>;
}

export interface AddOrderNoteInput extends OrderOperationInput {
  readonly body: string;
}

export interface ArchiveOrderNoteInput extends OrderOperationInput {
  readonly noteId: string;
}

export interface OrderMutationResult {
  readonly id: string;
  readonly status: OrderStatus;
  readonly paymentStatus: OrderPaymentStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

export interface ListOrdersResult {
  readonly items: readonly OrderListItem[];
  readonly nextCursor?: string;
}

export interface OrderRepository {
  getDashboardSummary(input: OrderAuthorityInput): Promise<OrderDashboardSummary>;
  listOrders(input: ListOrdersInput): Promise<ListOrdersResult>;
  getOrder(input: GetOrderInput): Promise<OrderDetail>;
  getOrderNeighbors(input: GetOrderInput): Promise<OrderNeighbors>;
  transitionStatus(input: TransitionOrderStatusInput): Promise<OrderMutationResult>;
  transitionPayment(input: TransitionOrderPaymentInput): Promise<OrderMutationResult>;
  updateShipping(input: UpdateOrderShippingInput): Promise<OrderMutationResult>;
  addNote(input: AddOrderNoteInput): Promise<OrderMutationResult>;
  archiveNote(input: ArchiveOrderNoteInput): Promise<OrderMutationResult>;
}

export interface OrderAuditEvent {
  readonly type: "order_commit_unknown";
}

export interface PostgresOrderRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly generateId: (kind: "note") => string;
  readonly audit: (event: OrderAuditEvent) => void | Promise<void>;
}
