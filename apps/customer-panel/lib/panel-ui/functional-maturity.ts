export const ADMIN_MODULE_KEYS = Object.freeze([
  "orders",
  "customers",
  "catalog_inventory",
  "discounts_marketing_content",
  "settings_team",
  "marketplaces_accounting_seo",
  "dashboard_analytics",
] as const);

export type AdminModuleKey = (typeof ADMIN_MODULE_KEYS)[number];

export const ADMIN_MODULE_MATURITY_STATES = Object.freeze([
  "foundation",
  "operational",
  "provider_gated",
  "production_ready",
] as const);

export type AdminModuleMaturityState = (typeof ADMIN_MODULE_MATURITY_STATES)[number];

export type AdminModuleMaturity = Readonly<{
  module: AdminModuleKey;
  state: AdminModuleMaturityState;
  operational: readonly string[];
  gaps: readonly string[];
}>;

function maturity(
  module: AdminModuleKey,
  state: AdminModuleMaturityState,
  operational: readonly string[],
  gaps: readonly string[],
): AdminModuleMaturity {
  return Object.freeze({
    module,
    state,
    operational: Object.freeze([...operational]),
    gaps: Object.freeze([...gaps]),
  });
}

export const ADMIN_MODULE_MATURITY: readonly AdminModuleMaturity[] = Object.freeze([
  maturity("orders", "foundation", [
    "list", "detail", "status", "payment_status", "shipping", "notes", "print", "quick_links", "abandoned_carts",
  ], [
    "billing", "taxes", "fulfillment_locations", "tags", "payment_requests", "provider_refunds", "invoices", "shipping_labels",
  ]),
  maturity("customers", "foundation", [
    "list", "detail", "create", "update", "archive", "notes", "tags", "segments", "export",
  ], [
    "address_book", "consent_history", "order_history", "privacy_erasure",
  ]),
  maturity("catalog_inventory", "foundation", [
    "products", "variants", "media", "collections", "brands", "attributes", "extras", "reviews", "barcode_labels",
    "imports", "locations", "purchasing", "counts", "transfers", "price_lists",
  ], [
    "stock_reservations", "supplier_documents", "warehouse_artifacts", "scheduled_import_execution",
  ]),
  maturity("discounts_marketing_content", "provider_gated", [
    "discount_records", "lucky_wheel_records", "campaign_configuration", "blog", "pages", "policies",
  ], [
    "discount_checkout_application", "campaign_delivery", "delivery_evidence", "content_preview", "publication_versions",
  ]),
  maturity("settings_team", "foundation", [
    "general", "language", "design", "shipping_configuration", "payment_configuration", "notifications", "administrators",
  ], [
    "shipping_rate_runtime", "notification_delivery", "administrator_invitations", "theme_publication",
  ]),
  maturity("marketplaces_accounting_seo", "provider_gated", [
    "provider_configuration", "accounting_profile", "seo_records", "sitemap_projection", "social_preview",
  ], [
    "marketplace_sync", "invoice_issuance", "payment_reconciliation", "indexing_execution",
  ]),
  maturity("dashboard_analytics", "foundation", [
    "dashboard_aggregates", "analytics_periods", "top_products",
  ], [
    "module_completion_status", "provider_health", "scheduled_reports",
  ]),
]);

export function getAdminModuleMaturity(module: AdminModuleKey): AdminModuleMaturity {
  const selected = ADMIN_MODULE_MATURITY.find((entry) => entry.module === module);
  if (selected === undefined) throw new TypeError("admin_module_maturity_invalid");
  return selected;
}
