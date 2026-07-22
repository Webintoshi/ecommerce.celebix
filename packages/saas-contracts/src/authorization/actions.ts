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
  "promotions.read",
  "promotions.manage",
  "promotions.archive",
  "content.read",
  "content.manage",
  "content.archive",
  "marketing.read",
  "marketing.manage",
  "configuration.read",
  "configuration.manage",
  "configuration.archive",
  "integrations.read",
  "integrations.manage",
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
    "promotions.read",
    "content.read",
    "content.manage",
    "marketing.read",
    "configuration.read",
    "integrations.read",
  ]),
  analyst: new Set<MerchantAction>([
    "orders.read",
    "quick_links.read",
    "carts.read",
    "customers.read",
    "catalog_admin.read",
    "promotions.read",
    "content.read",
    "marketing.read",
    "configuration.read",
    "integrations.read",
  ]),
});

export function isMerchantActionAllowed(
  role: StoreMembershipRole,
  action: MerchantAction,
): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}
