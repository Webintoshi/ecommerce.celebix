type QueryResult = Readonly<{
  rowCount: number | null;
  rows: readonly Record<string, unknown>[];
}>;

export type StorefrontDatabasePreflightClient = Readonly<{
  query: (statement: string) => Promise<QueryResult>;
}>;

const PREFLIGHT_QUERY = `SELECT current_setting('server_version_num')::integer AS version_num,
  current_database() AS database_name,
  role.rolsuper AS is_superuser,
  role.rolinherit AS role_inherits,
  pg_has_role(session_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,
  pg_has_role(session_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
  pg_has_role(session_user,'celebix_saas_host_resolver','SET') AS resolver_set,
  pg_has_role(session_user,'celebix_saas_workflow','SET') AS workflow_set,
  pg_has_role(session_user,'celebix_saas_host_resolver','USAGE') AS resolver_usage,
  pg_has_role(session_user,'celebix_saas_workflow','USAGE') AS workflow_usage,
  to_regclass('saas.store_domains') IS NOT NULL
    AND to_regclass('saas.product_media') IS NOT NULL
    AND to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL
    AND to_regprocedure('saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)') IS NOT NULL
    AND to_regprocedure('saas.public_list_product_media(uuid,text,timestamp with time zone,uuid)') IS NOT NULL
    AS migration_020,
  to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.quick_links_resolve_redemption(text,text,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.checkout_get_redemption_status(text,text,timestamp with time zone)') IS NOT NULL
    AS migration_027,
  pg_catalog.strpos(COALESCE((
    SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=to_regprocedure('saas.quick_links_claim_redemption(text,text,uuid,text,timestamp with time zone,timestamp with time zone)')
  ),''),'effective_expires_at:=LEAST(p_expires_at,current_link.expires_at)')>0 AS migration_028,
  to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL
    AND to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL
    AS migration_032,
  to_regprocedure('saas.storefront_checkout_preflight()') IS NOT NULL
    AND saas.storefront_checkout_preflight() AS migration_064,
  to_regprocedure('saas.storefront_checkout_default_shipping_preflight()') IS NOT NULL
    AND saas.storefront_checkout_default_shipping_preflight() AS migration_065,
  to_regclass('saas.store_analytics_connections') IS NOT NULL
    AND to_regprocedure('saas.analytics_connection_get_for_host(text,timestamp with time zone)') IS NOT NULL
    AS migration_039
FROM pg_roles AS role
WHERE role.rolname=session_user`;

export async function runStorefrontDatabasePreflight(
  client: StorefrontDatabasePreflightClient,
  expectedDatabaseName: string,
  analyticsMigrationRequired: boolean,
): Promise<void> {
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(PREFLIGHT_QUERY);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row
      || Math.floor(Number(row.version_num) / 10_000) !== 16
      || row.database_name !== expectedDatabaseName
      || row.is_superuser !== false
      || row.role_inherits !== false
      || row.resolver_member !== true
      || row.workflow_member !== true
      || row.resolver_set !== true
      || row.workflow_set !== true
      || row.resolver_usage !== false
      || row.workflow_usage !== false
      || row.migration_020 !== true
      || row.migration_027 !== true
      || row.migration_028 !== true
      || row.migration_032 !== true
      || row.migration_064 !== true
      || row.migration_065 !== true
      || (analyticsMigrationRequired && row.migration_039 !== true)) {
      throw new Error("storefront_database_preflight_failed");
    }
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
