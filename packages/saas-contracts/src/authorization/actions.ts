import type { StoreMembershipRole } from "../types.ts";

export const MERCHANT_ACTIONS = Object.freeze([
  "analytics.read",
  "orders.read",
  "orders.manage",
  "orders.fulfill",
  "orders.payment",
  "orders.note",
  "shipping.read",
  "shipping.manage",
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
  "inventory.read",
  "inventory.manage",
  "purchasing.read",
  "purchasing.manage",
  "pricing.read",
  "pricing.manage",
] as const);

export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

export const CATALOG_PRODUCT_OPERATIONS = Object.freeze([
  "read",
  "create",
  "update",
  "archive",
  "restore",
  "create_variant",
  "update_variant",
  "archive_variant",
  "manage_merchandising",
  "publish",
  "manage_media",
  "archive_media",
  "restore_media",
  "cleanup_media",
  "remove",
  "bulk_publish",
  "bulk_archive",
] as const);

export type CatalogProductOperation = (typeof CATALOG_PRODUCT_OPERATIONS)[number];

const CATALOG_PRODUCT_ACTIONS: Readonly<Record<CatalogProductOperation, MerchantAction>> =
  Object.freeze({
    read: "catalog_admin.read",
    create: "catalog_admin.manage",
    update: "catalog_admin.manage",
    archive: "catalog_admin.archive",
    restore: "catalog_admin.archive",
    create_variant: "catalog_admin.manage",
    update_variant: "catalog_admin.manage",
    archive_variant: "catalog_admin.archive",
    manage_merchandising: "catalog_admin.manage",
    publish: "catalog_admin.manage",
    manage_media: "catalog_admin.manage",
    archive_media: "catalog_admin.archive",
    restore_media: "catalog_admin.archive",
    cleanup_media: "catalog_admin.archive",
    remove: "catalog_admin.archive",
    bulk_publish: "catalog_admin.manage",
    bulk_archive: "catalog_admin.archive",
  });

const ROLE_ACTIONS: Readonly<
  Record<StoreMembershipRole, ReadonlySet<MerchantAction>>
> = Object.freeze({
  store_owner: new Set(MERCHANT_ACTIONS),
  admin: new Set(MERCHANT_ACTIONS),
  editor: new Set<MerchantAction>([
    "analytics.read",
    "orders.read",
    "orders.fulfill",
    "orders.note",
    "shipping.read",
    "shipping.manage",
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
    "inventory.read",
    "inventory.manage",
    "purchasing.read",
    "purchasing.manage",
    "pricing.read",
  ]),
  analyst: new Set<MerchantAction>([
    "analytics.read",
    "orders.read",
    "shipping.read",
    "quick_links.read",
    "carts.read",
    "customers.read",
    "catalog_admin.read",
    "promotions.read",
    "content.read",
    "marketing.read",
    "configuration.read",
    "integrations.read",
    "inventory.read",
    "purchasing.read",
    "pricing.read",
  ]),
});

export function isMerchantActionAllowed(
  role: StoreMembershipRole,
  action: MerchantAction,
): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}

export function catalogProductAction(operation: CatalogProductOperation): MerchantAction {
  return CATALOG_PRODUCT_ACTIONS[operation];
}

export function isCatalogProductOperationAllowed(
  role: StoreMembershipRole,
  operation: CatalogProductOperation,
): boolean {
  return isMerchantActionAllowed(role, catalogProductAction(operation));
}
