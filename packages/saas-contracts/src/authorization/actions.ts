import type { StoreMembershipRole } from "../types.ts";

export const MERCHANT_ACTIONS = Object.freeze([
  "orders.read",
  "orders.manage",
  "orders.fulfill",
  "orders.payment",
  "orders.note",
  "quick_links.read",
  "quick_links.manage",
  "carts.read",
  "carts.manage",
] as const);

export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

const ROLE_ACTIONS: Readonly<Record<StoreMembershipRole, ReadonlySet<MerchantAction>>> = Object.freeze({
  store_owner: new Set(MERCHANT_ACTIONS),
  admin: new Set(MERCHANT_ACTIONS),
  editor: new Set<MerchantAction>(["orders.read", "orders.fulfill", "orders.note", "quick_links.read", "carts.read"]),
  analyst: new Set<MerchantAction>(["orders.read", "quick_links.read", "carts.read"]),
});

export function isMerchantActionAllowed(role: StoreMembershipRole, action: MerchantAction): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}
