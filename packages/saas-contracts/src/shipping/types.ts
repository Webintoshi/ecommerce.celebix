export const SHIPPING_PROVIDER_CODES = Object.freeze(["basit_kargo"] as const);
export type ShippingProviderCode = (typeof SHIPPING_PROVIDER_CODES)[number];

export const SHIPPING_CONNECTION_STATUSES = Object.freeze([
  "pending",
  "active",
  "disabled",
  "revoked",
  "attention_required",
] as const);
export type ShippingConnectionStatus = (typeof SHIPPING_CONNECTION_STATUSES)[number];

export const SHIPPING_RESOURCE_KINDS = Object.freeze(["brand", "address", "handler"] as const);
export type ShippingResourceKind = (typeof SHIPPING_RESOURCE_KINDS)[number];

export const SHIPPING_QUOTE_STATUSES = Object.freeze(["quoted", "expired", "consumed"] as const);
export type ShippingQuoteStatus = (typeof SHIPPING_QUOTE_STATUSES)[number];

export const SHIPMENT_DIRECTIONS = Object.freeze(["outgoing", "incoming"] as const);
export type ShipmentDirection = (typeof SHIPMENT_DIRECTIONS)[number];

export const SHIPMENT_STATUSES = Object.freeze([
  "draft",
  "creating",
  "ready",
  "shipped",
  "out_for_delivery",
  "delivered",
  "delayed",
  "returning",
  "returned",
  "lost",
  "cancelled",
  "provider_outcome_unknown",
  "attention_required",
] as const);
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface ShippingConnection {
  readonly providerCode: ShippingProviderCode;
  readonly displayName: string;
  readonly status: ShippingConnectionStatus;
  readonly credentialVersion: number;
  readonly selectedBrandLabel?: string;
  readonly selectedAddressLabel?: string;
  readonly codDeliveredMarksPaid: boolean;
  readonly verifiedAt?: string;
  readonly version: number;
}

export interface ShippingResource {
  readonly id: string;
  readonly kind: ShippingResourceKind;
  readonly label: string;
  readonly active: boolean;
  readonly verifiedAt: string;
}

export interface ShippingPackage {
  readonly heightCm: number;
  readonly widthCm: number;
  readonly depthCm: number;
  readonly weightKg: number;
}

export interface ShippingQuoteOption {
  readonly id: string;
  readonly handlerCode: string;
  readonly handlerName: string;
  readonly desiKg: number;
  readonly priceCents: number;
  readonly codFeeCents?: number;
  readonly currency: "TRY";
}

export interface ShippingQuoteSession {
  readonly credential: string;
  readonly status: ShippingQuoteStatus;
  readonly expiresAt: string;
  readonly currency: "TRY";
  readonly packages: readonly ShippingPackage[];
  readonly options: readonly ShippingQuoteOption[];
}

export interface ShipmentItem {
  readonly orderItemId: string;
  readonly productName: string;
  readonly quantity: number;
}

export interface ShipmentEvent {
  readonly id: string;
  readonly status: ShipmentStatus;
  readonly occurredAt: string;
}

export type ShipmentLabel =
  | Readonly<{ available: false }>
  | Readonly<{ available: true; version: number }>;

export interface Shipment {
  readonly id: string;
  readonly providerCode: ShippingProviderCode;
  readonly direction: ShipmentDirection;
  readonly status: ShipmentStatus;
  readonly carrier?: string;
  readonly barcode?: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly priceCents?: number;
  readonly codAmountCents: number;
  readonly currency: "TRY";
  readonly items: readonly ShipmentItem[];
  readonly events: readonly ShipmentEvent[];
  readonly label: ShipmentLabel;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ShipmentMutationResult {
  readonly shipmentId: string;
  readonly status: ShipmentStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
