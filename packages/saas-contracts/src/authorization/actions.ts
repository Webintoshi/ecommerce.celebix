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
  "customers.read",
  "customers.manage",
  "customers.archive",
  "catalog_admin.read",
  "catalog_admin.manage",
  "catalog_admin.archive",
  "catalog_admin.import",
  "catalog_admin.moderate",
] as const);

export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

const ROLE_ACTIONS: Readonly<
  Record<StoreMembershipRole, ReadonlySet<MerchantAction>>
> = Object.freeze({
  store_owner: new Set(MERCHANT_ACTIONS),
  admin: new Set(MERCHANT_ACTIONS),
  editor: new Set<MerchantAction>([
    "orders.read",
    "orders.fulfill",
    "orders.note",
    "quick_links.read",
    "carts.read",
    "customers.read",
    "customers.manage",
    "catalog_admin.read",
    "catalog_admin.manage",
  ]),
  analyst: new Set<MerchantAction>([
    "orders.read",
    "quick_links.read",
    "carts.read",
    "customers.read",
    "catalog_admin.read",
  ]),
});

export function isMerchantActionAllowed(
  role: StoreMembershipRole,
  action: MerchantAction,
): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}
