import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";

import {
  PostgresAbandonedCartRepository,
  PostgresCatalogRepository,
  PostgresCatalogAdminRepository,
  PostgresMerchantAdminRepository,
  PostgresMerchantProviderProfileRepository,
  PostgresPaymentMethodRepository,
  PostgresAnalyticsRepository,
  PostgresCustomerRepository,
  PostgresInventoryRepository,
  PostgresPricingRepository,
  PostgresOrderRepository,
  PostgresQuickOrderLinkRepository,
  PostgresQuickOrderPrivateRepository,
  parseMerchantProviderCredentialKeyring,
} from "@celebix/saas-data";
import { createBoundedProviderTransport } from "@celebix/payment-adapters";
import pg from "pg";

import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import {
  createDefaultCustomerPanelPaymentProviderRegistry,
  createDefaultHostedPaymentAdapterRegistry,
  resolveCustomerPanelPaymentActivationMode,
} from "../payment-provider-adapters/default.ts";
import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { registerServerCatalogRepository } from "../server-catalog/runtime.ts";
import { registerServerCatalogAdminRepository } from "../server-catalog-admin/runtime.ts";
import { registerServerMerchantAdminRepository } from "../server-merchant-admin/runtime.ts";
import { registerServerPaymentMethodRepository } from "../server-payment-methods/runtime.ts";
import { registerServerAnalyticsRepository } from "../server-analytics/runtime.ts";
import { registerServerAbandonedCartRepository } from "../server-abandoned-carts/runtime.ts";
import { registerServerOrderRepository } from "../server-orders/runtime.ts";
import { registerServerCustomerRepository } from "../server-customers/runtime.ts";
import { registerServerInventoryRepository } from "../server-inventory/runtime.ts";
import { registerServerPricingRepository } from "../server-pricing/runtime.ts";
import { registerServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";
import {
  QUICK_LINK_SERVER_ENVIRONMENT_FIELDS,
  parseQuickLinkServerConfig,
} from "../server-quick-links/config.ts";
import { registerServerQuickLinksRuntime } from "../server-quick-links/runtime.ts";
import {
  createApprovedStagingServerPanelAccessRuntime,
  type ServerPanelAccessRuntime,
} from "./runtime.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
});

async function preflight(pool: pg.Pool, databaseName: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user, 'celebix_saas_identity', 'MEMBER') AS identity_member,
      pg_has_role(current_user, 'celebix_saas_app', 'MEMBER') AS catalog_member,
      to_regclass('saas.principals') IS NOT NULL
        AND to_regclass('saas.stores') IS NOT NULL
        AND to_regclass('saas.memberships') IS NOT NULL
        AND to_regclass('saas.plans') IS NOT NULL
        AND to_regclass('saas.plan_features') IS NOT NULL
        AND to_regclass('saas.plan_limits') IS NOT NULL
        AND to_regclass('saas.subscriptions') IS NOT NULL
        AND to_regclass('saas.registration_workflows') IS NOT NULL
        AND to_regclass('saas.oidc_transactions') IS NOT NULL
        AND to_regclass('saas.registration_verified_identities') IS NOT NULL
        AND to_regclass('saas.registration_tenant_completions') IS NOT NULL
        AND to_regclass('saas.panel_sessions') IS NOT NULL
        AND to_regclass('saas.panel_session_handoffs') IS NOT NULL
        AND to_regclass('saas.panel_browser_bindings') IS NOT NULL
        AND to_regclass('saas.products') IS NOT NULL
        AND to_regclass('saas.product_variants') IS NOT NULL
        AND to_regclass('saas.catalog_operations') IS NOT NULL AS migrations_001_019,
      to_regclass('saas.orders') IS NOT NULL
        AND to_regclass('saas.order_items') IS NOT NULL
        AND to_regclass('saas.order_events') IS NOT NULL
        AND to_regclass('saas.order_notes') IS NOT NULL
        AND to_regclass('saas.order_operations') IS NOT NULL AS migrations_022,
      to_regclass('saas.checkout_provider_configs') IS NOT NULL
        AND to_regclass('saas.quick_order_links') IS NOT NULL
        AND to_regclass('saas.quick_order_link_items') IS NOT NULL
        AND to_regclass('saas.quick_order_link_operations') IS NOT NULL
        AND to_regclass('saas.quick_order_redemption_sessions') IS NOT NULL
        AND to_regclass('saas.checkout_payment_attempts') IS NOT NULL
        AND to_regclass('saas.checkout_inventory_reservations') IS NOT NULL
        AND to_regclass('saas.checkout_callback_receipts') IS NOT NULL
        AND to_regclass('saas.checkout_reconciliation_jobs') IS NOT NULL
        AND to_regclass('saas.checkout_reconciliation_run') IS NOT NULL
        AND to_regclass('saas.checkout_reconciliation_receipts') IS NOT NULL
        AND to_regclass('saas.checkout_operations') IS NOT NULL AS migrations_024_026,
      to_regclass('saas.panel_sessions') IS NOT NULL AS sessions,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='resolve_panel_session'
      ) AS session_resolver,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='rotate_panel_session'
      ) AS session_rotator,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='revoke_panel_session'
      ) AS session_revoker,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='recover_panel_session_operation'
      ) AS session_recovery,
      to_regprocedure('saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL AS catalog_reader,
      to_regprocedure('saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)') IS NOT NULL AS catalog_lister,
      to_regprocedure('saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS catalog_creator,
      to_regprocedure('saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,text)') IS NOT NULL AS catalog_updater,
      to_regprocedure('saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL AS catalog_archiver,
      to_regprocedure('saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS variant_creator,
      to_regprocedure('saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS variant_updater,
      to_regprocedure('saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)') IS NOT NULL AS variant_archiver,
      to_regprocedure('saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS catalog_recovery,
      to_regprocedure('saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NOT NULL AS catalog_details,
      to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NOT NULL AS merchant_action_authority,
      to_regprocedure('saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL AS analytics_dashboard,
      to_regprocedure('saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL AS order_summary,
      to_regprocedure('saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL AS order_lister,
      to_regprocedure('saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL AS order_reader,
      to_regprocedure('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL AS order_status_transition,
      to_regprocedure('saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL AS order_payment_transition,
      to_regprocedure('saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb,jsonb)') IS NOT NULL AS order_shipping_update,
      to_regprocedure('saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)') IS NOT NULL AS order_note_adder,
      to_regprocedure('saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)') IS NOT NULL AS order_note_archiver,
      to_regprocedure('saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS order_recovery,
      to_regprocedure('saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS abandoned_cart_repository,
      to_regprocedure('saas.customers_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.customers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.customers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.customers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.customers_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.customers_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.customers_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS customer_repository,
      to_regprocedure('saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])') IS NOT NULL
        AND to_regprocedure('saas.catalog_admin_list_reviews(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.catalog_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS catalog_admin_repository,
      to_regprocedure('saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NOT NULL
        AND to_regprocedure('saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS merchant_admin_repository,
      to_regprocedure('saas.merchant_provider_profile_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.merchant_provider_profile_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS merchant_provider_profile_repository,
      to_regclass('saas.payment_methods') IS NOT NULL
        AND to_regclass('saas.payment_method_operations') IS NOT NULL
        AND to_regprocedure('saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)') IS NOT NULL
        AND to_regprocedure('saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS payment_method_repository,
      to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()') IS NOT NULL
        AND saas.payment_provider_keyed_lifecycle_preflight() AS payment_provider_keyed_lifecycle,
      to_regprocedure('saas.quick_order_hosted_payment_authority_preflight()') IS NOT NULL
        AND saas.quick_order_hosted_payment_authority_preflight() AS quick_order_hosted_authority,
      to_regprocedure('saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)') IS NOT NULL AS quick_link_repository,
      to_regprocedure('saas.quick_links_get_provider_readiness(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_configure_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,text,text,jsonb,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_revoke_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_reveal_credential(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.quick_links_reveal_provider_configuration(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL AS quick_link_private_repository,
      to_regclass('saas.store_analytics_connections') IS NOT NULL
        AND to_regclass('saas.analytics_connection_operations') IS NOT NULL
        AND to_regclass('saas.analytics_delivery_outbox') IS NOT NULL
        AND to_regprocedure('saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.analytics_connection_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)') IS NOT NULL
        AND to_regprocedure('saas.analytics_connection_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.analytics_connection_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.analytics_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS analytics_repository,
      to_regclass('saas.inventory_locations') IS NOT NULL
        AND to_regclass('saas.inventory_balances') IS NOT NULL
        AND to_regclass('saas.inventory_movements') IS NOT NULL
        AND to_regclass('saas.purchase_orders') IS NOT NULL
        AND to_regclass('saas.purchase_order_lines') IS NOT NULL
        AND to_regclass('saas.inventory_operations') IS NOT NULL
        AND to_regclass('saas.inventory_counts') IS NOT NULL
        AND to_regclass('saas.inventory_count_lines') IS NOT NULL
        AND to_regclass('saas.inventory_transfers') IS NOT NULL
        AND to_regclass('saas.inventory_transfer_lines') IS NOT NULL
        AND to_regclass('saas.inventory_location_operations') IS NOT NULL AS inventory_relations,
      to_regclass('saas.price_lists') IS NOT NULL
        AND to_regclass('saas.price_list_items') IS NOT NULL
        AND to_regclass('saas.price_list_rules') IS NOT NULL
        AND to_regclass('saas.price_list_operations') IS NOT NULL AS pricing_relations,
      to_regprocedure('saas.inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,text,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL
        AND to_regprocedure('saas.purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,uuid,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL
        AND to_regprocedure('saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS inventory_repository
      ,to_regprocedure('saas.pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])') IS NOT NULL AS pricing_repository
       ,to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)') IS NOT NULL AS pricing_resolver
    FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 || !row ||
      Math.floor(Number(row.version_num) / 10_000) !== 16 ||
      row.database_name !== databaseName || row.is_superuser !== false ||
      row.identity_member !== true || row.catalog_member !== true || row.migrations_001_019 !== true ||
      row.migrations_022 !== true ||
      row.migrations_024_026 !== true ||
      row.sessions !== true || row.session_resolver !== true || row.session_rotator !== true ||
      row.session_revoker !== true || row.session_recovery !== true || row.catalog_reader !== true ||
      row.catalog_lister !== true || row.catalog_creator !== true || row.catalog_updater !== true ||
      row.catalog_archiver !== true || row.variant_creator !== true || row.variant_updater !== true ||
      row.variant_archiver !== true || row.catalog_recovery !== true || row.catalog_details !== true ||
      row.merchant_action_authority !== true || row.analytics_dashboard !== true || row.order_summary !== true || row.order_lister !== true ||
      row.order_reader !== true || row.order_status_transition !== true ||
      row.order_payment_transition !== true || row.order_shipping_update !== true ||
      row.order_note_adder !== true || row.order_note_archiver !== true || row.order_recovery !== true ||
      row.abandoned_cart_repository !== true ||
      row.customer_repository !== true ||
      row.catalog_admin_repository !== true ||
      row.merchant_admin_repository !== true ||
      row.merchant_provider_profile_repository !== true ||
      row.payment_method_repository !== true || row.payment_provider_keyed_lifecycle !== true ||
      row.quick_order_hosted_authority !== true ||
      row.quick_link_repository !== true || row.quick_link_private_repository !== true ||
      row.analytics_repository !== true ||
      row.inventory_relations !== true || row.inventory_repository !== true ||
      row.pricing_relations !== true || row.pricing_repository !== true || row.pricing_resolver !== true
    ) throw new Error("server_panel_access_database_preflight_failed");
  } finally { client.release(); }
}

export async function initializeApprovedStagingServerPanelAccessRuntime(
  config: CustomerPanelStagingAuthConfig,
): Promise<ServerPanelAccessRuntime> {
  const pool = new Pool({
    connectionString: config.database.url,
    max: 10,
    connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
    idleTimeoutMillis: 10_000,
    statement_timeout: TIMEOUTS.statementMs,
    lock_timeout: TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
    application_name: `celebix-panel-${config.activationId}`,
  });
  pool.on("error", () => undefined);
  try {
    await preflight(pool, config.database.name);
    const quickLinksConfig = parseQuickLinkServerConfig(Object.fromEntries(
      QUICK_LINK_SERVER_ENVIRONMENT_FIELDS.map((field) => [field, process.env[field]]),
    ));
    const providerCredentialKeyring = parseMerchantProviderCredentialKeyring(process.env);
    const sessionRepository = createPostgresPanelSessionRepository(
      createPanelSessionPersistenceApproval("approved_staging"),
      {
        pool,
        keys: new Map([[config.keys.sessionKeyId, new Uint8Array(config.keys.session)]]),
        activeKeyId: config.keys.sessionKeyId,
        clock: () => new Date(),
        randomBytes: (size: number) => new Uint8Array(randomBytes(size)),
        timeouts: TIMEOUTS,
        cleanupLimit: 25,
        audit: () => undefined,
      },
    );
    const catalogRepository = new PostgresCatalogRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      generateId: () => randomUUID(),
      audit: () => undefined,
    });
    const orderRepository = new PostgresOrderRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      generateId: () => randomUUID(),
      audit: () => undefined,
    });
    const abandonedCartRepository = new PostgresAbandonedCartRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const customerRepository = new PostgresCustomerRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const catalogAdminRepository = new PostgresCatalogAdminRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const merchantAdminRepository = new PostgresMerchantAdminRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const paymentMethodRepository = new PostgresPaymentMethodRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const providerProfileRepository = new PostgresMerchantProviderProfileRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    const hostedPaymentAdapters = createDefaultHostedPaymentAdapterRegistry(
      createBoundedProviderTransport({
        fetch: (request) => fetch(request),
        timeoutMs: 5_000,
        maximumResponseBytes: 262_144,
      }),
    );
    const paymentProviderRegistry = createDefaultCustomerPanelPaymentProviderRegistry(
      hostedPaymentAdapters,
      null,
      resolveCustomerPanelPaymentActivationMode(process.env),
    );
    const analyticsRepository = new PostgresAnalyticsRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const inventoryRepository = new PostgresInventoryRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const pricingRepository = new PostgresPricingRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      uuid: randomUUID,
      audit: () => undefined,
    });
    const quickLinkRepositoryOptions = {
      pool,
      role: "celebix_saas_app" as const,
      timeouts: TIMEOUTS,
      audit: () => undefined,
    };
    const quickLinkRepository = new PostgresQuickOrderLinkRepository(quickLinkRepositoryOptions);
    const quickLinkPrivateRepository = new PostgresQuickOrderPrivateRepository(quickLinkRepositoryOptions);
    const access = createApprovedStagingServerPanelAccessRuntime(
      sessionRepository,
      config.authority.panelOrigin,
    );
    registerServerCatalogRepository(access, catalogRepository);
    registerServerOrderRepository(access, orderRepository);
    registerServerAbandonedCartRepository(access, abandonedCartRepository);
    registerServerCustomerRepository(access, customerRepository);
    registerServerCatalogAdminRepository(access, catalogAdminRepository);
    registerServerMerchantAdminRepository(access, merchantAdminRepository);
    registerServerPaymentMethodRepository(access, paymentMethodRepository);
    registerServerProviderExecutionRuntime(
      access,
      providerProfileRepository,
      providerCredentialKeyring,
      paymentProviderRegistry,
      hostedPaymentAdapters,
    );
    registerServerAnalyticsRepository(access, analyticsRepository);
    registerServerInventoryRepository(access, inventoryRepository);
    registerServerPricingRepository(access, pricingRepository);
    registerServerQuickLinksRuntime(access, {
      links: quickLinkRepository,
      privateLinks: quickLinkPrivateRepository,
      methods: paymentMethodRepository,
      keyring: quickLinksConfig.keyring,
      paytrConfiguration: quickLinksConfig.paytrConfiguration,
    });
    return access;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}
