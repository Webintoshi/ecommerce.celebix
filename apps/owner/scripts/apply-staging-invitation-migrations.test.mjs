import assert from 'node:assert/strict';
import test from 'node:test';
import { rootCertificates } from 'node:tls';
import { readFile } from 'node:fs/promises';
import { resolveInvitationMigrationConfiguration, runInvitationMigrations } from './apply-staging-invitation-migrations.mjs';
const env = { CELEBIX_DEPLOYMENT_TIER:'staging', CELEBIX_SAAS_AUTH_MODE:'approved_staging', CELEBIX_STAGING_MIGRATION_MODE:'approved_staging', CELEBIX_SAAS_DATABASE_NAME:'celebix_saas_staging_auth01', CELEBIX_TOSHI_MIGRATION_DATABASE_URL:'postgresql://fixture:fixture@db.example.test/celebix_saas_staging_auth01?sslmode=require', CELEBIX_STAGING_DB_CA_B64:Buffer.from(rootCertificates[0]).toString('base64') };
test('migration config forces verified CA TLS and rejects ambiguous/weak modes and targets', () => {
  for (const mode of ['require','verify-full']) { const config=resolveInvitationMigrationConfiguration({...env,CELEBIX_TOSHI_MIGRATION_DATABASE_URL:env.CELEBIX_TOSHI_MIGRATION_DATABASE_URL.replace('require',mode)}); assert.equal(config.ssl.rejectUnauthorized,true); assert.equal(config.ssl.ca,rootCertificates[0]); assert.equal(new URL(config.connectionString).search,''); }
  for(const patch of [{CELEBIX_DEPLOYMENT_TIER:'production'},{CELEBIX_STAGING_DB_CA_B64:'invalid'},{CELEBIX_SAAS_DATABASE_NAME:'celebix_saas_staging_other'},...['disable','prefer','allow','require&sslmode=verify-full','require&sslcert=x'].map(mode=>({CELEBIX_TOSHI_MIGRATION_DATABASE_URL:env.CELEBIX_TOSHI_MIGRATION_DATABASE_URL.replace('require',mode)}))]) assert.throws(()=>resolveInvitationMigrationConfiguration({...env,...patch}),/invitation_migration_configuration_invalid/);
});
const readSql = name => readFile(new URL(`./sql/saas/${name}`,import.meta.url),'utf8');
function client(state='absent') {
  const queries=[]; let applied=false;
  return { queries, async connect(){}, async end(){}, async query(sql,values) { queries.push(sql); if(sql.includes('invitation_migration_preflight')) return {rows:[{database_name:'celebix_saas_staging_auth01',version_num:160014,owner_member:true,is_superuser:false,predecessor:true}]}; if(sql.includes('invitation_migration_state')) return {rows:[{state:applied?'complete':state}]}; if(sql.includes('CREATE TABLE saas.store_admin_invitations')) applied=true; return {rows:[]}; } };
}
test('runner applies only 129–131 atomically, runs assertions, rechecks and is idempotent', async()=>{
  for(const state of ['absent','complete']) { const c=client(state), output=[]; const result=await runInvitationMigrations({client:c,readSql,write:x=>output.push(x)}); assert.equal(result,state==='absent'?'applied':'already_complete'); assert.equal(c.queries.filter(x=>x==='COMMIT').length,1); assert.equal(c.queries.some(x=>x.includes('CREATE TABLE saas.store_admin_invitations')),state==='absent'); assert.ok(c.queries.some(x=>x.includes('INVITATION_MANAGER_ASSERTION_FAILED'))); assert.equal(JSON.stringify(output).includes('postgresql'),false); }
});
test('partial schema and missing owner capability fail closed without DDL', async()=>{
  const c=client('partial'); await assert.rejects(()=>runInvitationMigrations({client:c,readSql,write(){}}),/invitation_migration_failed/); assert.equal(c.queries.some(x=>x.includes('CREATE TABLE')),false); assert.ok(c.queries.includes('ROLLBACK'));
  const denied=client(); denied.query=async sql=>{denied.queries.push(sql);return{rows:[{database_name:'celebix_saas_staging_auth01',version_num:160014,owner_member:false,is_superuser:false,predecessor:true}]}};
  await assert.rejects(()=>runInvitationMigrations({client:denied,readSql,write(){}})); assert.equal(denied.queries.some(x=>x.includes('CREATE TABLE')),false);
});
