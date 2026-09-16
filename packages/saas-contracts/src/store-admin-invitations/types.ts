import type { StoreMembershipRole } from "../types.ts";

export type StoreAdminInvitationRole = Extract<StoreMembershipRole, "admin" | "editor" | "analyst">;

export const STORE_ADMIN_INVITATION_ROLES = Object.freeze([
  "admin",
  "editor",
  "analyst",
] as const satisfies readonly StoreAdminInvitationRole[]);

export const STORE_ADMIN_INVITATION_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const);

export const STORE_ADMIN_INVITATION_DELIVERY_STATUSES = Object.freeze([
  "queued",
  "sending",
  "provider_accepted",
  "delivered",
  "failed",
  "outcome_unknown",
] as const);

export type StoreAdminInvitationStatus = (typeof STORE_ADMIN_INVITATION_STATUSES)[number];
export type StoreAdminInvitationDeliveryStatus = (typeof STORE_ADMIN_INVITATION_DELIVERY_STATUSES)[number];

export interface StoreAdminInvitationView {
  readonly id: string;
  readonly sourceRecordId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: StoreAdminInvitationRole;
  readonly status: StoreAdminInvitationStatus;
  readonly deliveryStatus: StoreAdminInvitationDeliveryStatus | null;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly generation: number;
}

/** Parsing this shape validates syntax only; it does not grant invitation authority. */
export interface StoreAdminInvitationSendIntent {
  readonly sourceRecordId: string;
  readonly expectedRecordVersion: number;
  readonly operationId: string;
}

/** Parsing this shape validates syntax only; authorization remains a server responsibility. */
export interface StoreAdminInvitationActionIntent {
  readonly invitationId: string;
  readonly expectedVersion: number;
  readonly operationId: string;
}
