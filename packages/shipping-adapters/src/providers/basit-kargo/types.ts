import type { ShipmentStatus } from "@celebix/saas-contracts";

export const BASIT_KARGO_STATUSES = Object.freeze([
  "NEW",
  "READY_TO_SHIP",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "NEEDS_SUPPORT",
  "DELAYED",
  "RETURNING",
  "RETURNED",
  "LOST",
] as const);
export type BasitKargoStatus = (typeof BASIT_KARGO_STATUSES)[number];

export type BasitKargoCredential = Readonly<{ token: string }>;

export const BASIT_KARGO_STATUS_MAP: Readonly<Record<BasitKargoStatus, ShipmentStatus>> = Object.freeze({
  NEW: "ready",
  READY_TO_SHIP: "ready",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  NEEDS_SUPPORT: "attention_required",
  DELAYED: "delayed",
  RETURNING: "returning",
  RETURNED: "returned",
  LOST: "lost",
});
