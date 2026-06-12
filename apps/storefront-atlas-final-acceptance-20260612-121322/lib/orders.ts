import { Order } from "@/types/order";

export const ORDERS: Order[] = [];

export function getOrders(): Order[] {
  return ORDERS;
}

export function getOrderById(id: string): Order | undefined {
  return ORDERS.find((o) => o.id === id);
}

export function updateOrderStatus(id: string, status: Order["status"]): void {
  const order = ORDERS.find((o) => o.id === id);
  if (order) {
    order.status = status;
    order.updatedAt = new Date();
  }
}

export function updateOrderPaymentStatus(
  id: string,
  paymentStatus: Order["paymentStatus"]
): void {
  const order = ORDERS.find((o) => o.id === id);
  if (order) {
    order.paymentStatus = paymentStatus;
    order.updatedAt = new Date();
  }
}
