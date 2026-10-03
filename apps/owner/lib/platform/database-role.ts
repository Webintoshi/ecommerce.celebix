export function assertPlatformDatabaseRole(row:Record<string,unknown>|undefined):void {
 if(!row||row.operator!==true||row.excessive!==false||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'].some(flag=>row[flag]!==false))throw new Error('platform_database_role_invalid');
}
export const PLATFORM_ROLE_QUERY="SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,pg_has_role(current_user,'celebix_saas_platform_operator','MEMBER') AS operator,EXISTS(SELECT 1 FROM unnest(ARRAY['celebix_saas_owner','celebix_saas_bootstrap','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_migrator']) AS privileged(name) WHERE pg_has_role(current_user,privileged.name,'MEMBER')) AS excessive FROM pg_roles WHERE rolname=current_user";
