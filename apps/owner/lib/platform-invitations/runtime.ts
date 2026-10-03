import 'server-only';
import {Pool} from 'pg';
import {OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS,parseOwnerStagingAuthConfig,createOwnerStagingDatabasePoolConfig} from '../self-serve-auth-authority/config.ts';
import {createLogtoOidcProvider} from '../self-serve-logto-provider/provider.ts';
import {createAes256GcmPayloadCipher} from '../saas-persistence/identity-crypto.ts';
import {createInvitationTransport} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
import {PostgresInvitationRepository} from '../../../../packages/saas-data/src/platform-invitations/repository.ts';
import {createInvitationService} from './service.ts';

async function initialize(){
 const config=parseOwnerStagingAuthConfig(Object.fromEntries(OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,process.env[name]])));
 const pool=new Pool({...createOwnerStagingDatabasePoolConfig(config.database),max:3,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:5000,lock_timeout:3000,idle_in_transaction_session_timeout:5000,application_name:'celebix-platform-invitations'});
 pool.on('error',()=>undefined);
 try{
  const checked=await pool.query(`SELECT current_database() AS database, r.rolsuper AS superuser,pg_has_role(current_user,'celebix_saas_identity','MEMBER') AS identity_member,
   (SELECT count(*)=3 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('platform_invitation_start','platform_invitation_claim','platform_invitation_complete')) AS helpers FROM pg_roles r WHERE r.rolname=current_user`);
  const row=checked.rows[0];if(!row||row.database!==config.database.name||row.superuser!==false||row.identity_member!==true||row.helpers!==true)throw Error('invitation_unavailable');
 }catch(error){await pool.end().catch(()=>undefined);throw error;}
 const clock=()=>new Date();
 const transport=createInvitationTransport({key:config.keys.callbackInternal,keyId:config.keys.callbackInternalKeyId,clock});
 const service=createInvitationService({repository:new PostgresInvitationRepository(pool),
  provider:createLogtoOidcProvider({issuer:config.logto.issuer,discoveryUrl:config.logto.discoveryUrl,clientId:config.logto.clientId,clientSecret:config.logto.clientSecret,tokenAuthMethod:config.logto.tokenAuthMethod,algorithms:config.logto.algorithms,fetch,clock,timeoutMs:8000,maximumResponseBytes:65536}),
  cipher:createAes256GcmPayloadCipher({currentKeyId:config.keys.identityEncryptionKeyId,resolveKey:id=>id===config.keys.identityEncryptionKeyId?config.keys.identityEncryption:undefined}),issuer:config.logto.issuer,audience:config.logto.clientId,callbackUrl:config.authority.panelCallbackUrl,clock,seal:transport.seal});
 return {transport,service,ownerOrigin:config.authority.ownerOrigin};
}
let runtime:ReturnType<typeof initialize>|undefined;
export function invitationRuntime(){return runtime??=initialize().catch(error=>{runtime=undefined;throw error;});}
