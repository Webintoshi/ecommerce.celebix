import type { StoreMembershipRole } from "../types.ts";

export const MERCHANT_ACTIONS = Object.freeze([
  "orders.read",
  "orders.manage",
  "orders.fulfill",
  "orders.payment",
  "orders.note",
] as const);

export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

const ROLE_ACTIONS: Readonly<Record<StoreMembershipRole, ReadonlySet<MerchantAction>>> = Object.freeze({
  store_owner: new Set(MERCHANT_ACTIONS),
  admin: new Set(MERCHANT_ACTIONS),
  editor: new Set<MerchantAction>(["orders.read", "orders.fulfill", "orders.note"]),
  analyst: new Set<MerchantAction>(["orders.read"]),
});

export function isMerchantActionAllowed(role: StoreMembershipRole, action: MerchantAction): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}
