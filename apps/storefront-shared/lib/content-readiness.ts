export const PUBLIC_CONTENT_READINESS_SQL = `SELECT
  to_regprocedure('saas.public_content_page_get(text,timestamptz,text)') IS NOT NULL
  AND to_regprocedure('saas.public_content_locale_get(text,timestamptz)') IS NOT NULL
  AND to_regprocedure('saas.public_content_page_get_v2(text,timestamptz,text,text)') IS NOT NULL
  AND to_regprocedure('saas.public_blog_get(text,timestamptz,text,text)') IS NOT NULL
  AND to_regprocedure('saas.public_blog_list(text,timestamptz,text,integer,jsonb)') IS NOT NULL
  AND to_regprocedure('saas.public_content_sitemap_index(text,timestamptz)') IS NOT NULL
  AND to_regprocedure('saas.public_content_sitemap_page(text,timestamptz,text,integer)') IS NOT NULL
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_content_page_get(text,timestamptz,text)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_content_locale_get(text,timestamptz)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_content_page_get_v2(text,timestamptz,text,text)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_blog_get(text,timestamptz,text,text)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_blog_list(text,timestamptz,text,integer,jsonb)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_content_sitemap_index(text,timestamptz)'),'EXECUTE')
  AND has_function_privilege('celebix_saas_host_resolver',to_regprocedure('saas.public_content_sitemap_page(text,timestamptz,text,integer)'),'EXECUTE') AS ready`;

export function publicContentReadiness(result: Readonly<{ rowCount: number | null; rows: readonly { ready?: unknown }[] }>): boolean {
  return result.rowCount === 1 && result.rows.length === 1 && result.rows[0]?.ready === true;
}
