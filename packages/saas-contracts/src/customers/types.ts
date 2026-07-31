export const CUSTOMER_STATUSES = Object.freeze(["active", "archived"] as const);
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_CONSENT_CHANNELS = Object.freeze(["email", "phone", "whatsapp"] as const);
export type CustomerConsentChannel = (typeof CUSTOMER_CONSENT_CHANNELS)[number];
export type CustomerConsentStatus = "granted" | "denied";

export interface CustomerTagRef { readonly id: string; readonly name: string; readonly color: string }
export interface CustomerSegmentRef { readonly id: string; readonly name: string; readonly kind: "manual" }
export interface CustomerListItem {
  readonly id: string; readonly status: CustomerStatus; readonly displayName: string;
  readonly firstName: string; readonly lastName: string; readonly email?: string; readonly phone?: string;
  readonly orderCount: number; readonly totalSpentCents: number; readonly currency: string;
  readonly lastOrderAt?: string; readonly tags: readonly CustomerTagRef[];
  readonly version: number; readonly createdAt: string; readonly updatedAt: string;
}
export interface CustomerAddress {
  readonly id: string; readonly label: string; readonly recipientName: string; readonly line1: string;
  readonly line2?: string; readonly city: string; readonly district?: string; readonly postalCode?: string;
  readonly country: string; readonly isDefault: boolean; readonly version: number;
}
export interface CustomerConsent { readonly channel: CustomerConsentChannel; readonly status: CustomerConsentStatus; readonly recordedAt: string }
export interface CustomerNote { readonly id: string; readonly text: string; readonly createdAt: string }
export interface CustomerDetail extends CustomerListItem {
  readonly addresses: readonly CustomerAddress[]; readonly consents: readonly CustomerConsent[];
  readonly notes: readonly CustomerNote[]; readonly segments: readonly CustomerSegmentRef[];
}
export interface CustomerSummary { readonly active: number; readonly archived: number; readonly consentedEmail: number; readonly totalSpentCents: number; readonly currency: string; readonly asOf: string }
export interface CustomerTag extends CustomerTagRef { readonly customerCount: number; readonly version: number }
export interface CustomerSegment extends CustomerSegmentRef { readonly description?: string; readonly customerCount: number; readonly version: number }
export interface CustomerMutationResult { readonly id: string; readonly version: number; readonly status: CustomerStatus; readonly updatedAt: string; readonly replayed: boolean }
export interface CustomerNeighbor { readonly id: string; readonly displayName: string }
export interface CustomerOrderSummary {
  readonly id: string; readonly orderNumber: string; readonly status: OrderStatus;
  readonly paymentStatus: OrderPaymentStatus; readonly totalCents: number;
  readonly currency: string; readonly createdAt: string;
}
export interface CustomerWorkspace {
  readonly neighbors: Readonly<{ readonly previous?: Readonly<CustomerNeighbor>; readonly next?: Readonly<CustomerNeighbor> }>;
  readonly orders: readonly Readonly<CustomerOrderSummary>[];
}
import type { OrderPaymentStatus, OrderStatus } from "../orders/types.ts";
