import type pg from 'pg';

// The typed editor is optional until migration 174 is installed. This probe
// never changes the existing panel-wide database preflight.
export async function merchantContentReady(pool: Pick<pg.Pool, 'query'>): Promise<boolean> {
  const result = await pool.query(`SELECT
    to_regclass('saas.merchant_content_bodies') IS NOT NULL
    AND to_regclass('saas.merchant_content_versions') IS NOT NULL
    AND pg_has_role(current_user, 'celebix_saas_app', 'MEMBER')
    AND COALESCE(has_function_privilege('celebix_saas_app', to_regprocedure('saas.merchant_content_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)'), 'EXECUTE'), false)
    AND COALESCE(has_function_privilege('celebix_saas_app', to_regprocedure('saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb)'), 'EXECUTE'), false)
    AND COALESCE(has_function_privilege('celebix_saas_app', to_regprocedure('saas.merchant_content_versions(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid,integer,bigint)'), 'EXECUTE'), false)
    AS ready`);
  return result.rowCount === 1 && result.rows.length === 1 && result.rows[0]?.ready === true;
}
