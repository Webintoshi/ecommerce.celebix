import 'server-only';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {openMerchantProviderCredential,sealMerchantProviderCredential,type MerchantProviderCredentialKeyring,type ToshiProviderRepository,type ToshiProviderCredentialAuthority} from '@celebix/saas-data';
export const CENTRAL_TOSHI_MODEL='deepseek-flash';
export function centralToshiConfigured(env:Readonly<Record<string,string|undefined>>=process.env):boolean{return Boolean(env.TOSHI_DEEPSEEK_API_KEY?.trim());}
type BindingRepository=Pick<ToshiProviderRepository,'getAuthority'|'getConnectionIdentity'|'connect'>;
const unavailable=()=>Object.assign(Error('connection_missing'),{code:'connection_missing'});
/** Native provenance binds a real profile, but the platform API key is NEVER persisted in merchant provider records. */
export function createCentralToshiAuthority(providers:BindingRepository,keyring:()=>MerchantProviderCredentialKeyring,env:Readonly<Record<string,string|undefined>>=process.env):Pick<ToshiProviderRepository,'getAuthority'>{
 const pending=new Map<string,Promise<ToshiProviderCredentialAuthority>>();
 return Object.freeze({async getAuthority(input){
  const value=env.TOSHI_DEEPSEEK_API_KEY?.trim();if(!value||value.length>512||/[\s\u0000-\u001f]/u.test(value))throw unavailable();
  const secret=new TextEncoder().encode(value);
  const sealFor=(plaintext:Uint8Array,current:Pick<ToshiProviderCredentialAuthority,'configId'|'credentialVersion'>)=>{
   const keys=keyring();try{return sealMerchantProviderCredential({plaintext,profileId:current.configId,storeId:input.tenantContext.store.id,providerCode:'deepseek',capability:'ai_assistant',credentialVersion:current.credentialVersion,keyring:keys});}finally{keys.keys.forEach(k=>k.key.fill(0));}
  };
  const storeId=input.tenantContext.store.id;
  try{
   let current:ToshiProviderCredentialAuthority|null=null;
   try{current=await providers.getAuthority({...input,provider:'deepseek'});}catch(error){if(!['connection_missing','connection_revoked'].includes(String((error as {code?:string})?.code)))throw error;}
   if(!current||current.selectedModel!==CENTRAL_TOSHI_MODEL){
    let work=pending.get(storeId);
    if(!work){work=(async()=>{
     const identity=await providers.getConnectionIdentity({...input,provider:'deepseek'}),configId=identity?.configId??randomUUID(),credentialVersion=(identity?.credentialVersion??0)+1;
     // Re-encrypt an existing MERCHANT credential unchanged when updating model metadata.
     // A new nondefault profile carries only a deliberately non-API provenance placeholder.
     let retained:Uint8Array=new TextEncoder().encode('celebix-toshi-provenance-only-v1');
     if(current){const keys=keyring();try{const old=openMerchantProviderCredential({envelope:current.sealedCredentials,profileId:current.configId,storeId,providerCode:'deepseek',capability:'ai_assistant',credentialVersion:current.credentialVersion,keyring:keys});if(old.length===secret.length&&timingSafeEqual(old,secret)){old.fill(0);}else{retained.fill(0);retained=old;}}catch{/* An already unreadable merchant credential is not a platform credential. */}finally{keys.keys.forEach(k=>k.key.fill(0));}}
     try{
      const sealedCredentials=sealFor(retained,{configId,credentialVersion}),digest=createHash('sha256').update(retained).digest('hex');
      try{await providers.connect({...input,provider:'deepseek',operationId:randomUUID(),configId,sealedCredentials,credentialDigest:`sha256:${digest}`,credentialVersion,maskedKey:'••••oshi',selectedModel:CENTRAL_TOSHI_MODEL,availableModels:[{id:CENTRAL_TOSHI_MODEL,label:'Toshi'}],expectedVersion:identity?.version??0});}catch(error){if((error as {code?:string})?.code!=='version_conflict')throw error;}
      return await providers.getAuthority({...input,provider:'deepseek'});
     }finally{retained.fill(0);}
    })();pending.set(storeId,work);}
    try{current=await work;}finally{if(pending.get(storeId)===work)pending.delete(storeId);}
   }
   if(current.provider!=='deepseek'||current.selectedModel!==CENTRAL_TOSHI_MODEL)throw unavailable();
   return Object.freeze({...current,sealedCredentials:sealFor(secret,current)});
  }finally{secret.fill(0);}
 }});
}
/** Legacy chat/resource paths may retain customer BYOK, but cannot spend the platform key without credit metering. */
export function createMerchantOnlyToshiAuthority(providers:Pick<ToshiProviderRepository,'getAuthority'>,keyring:()=>MerchantProviderCredentialKeyring,env:Readonly<Record<string,string|undefined>>=process.env):Pick<ToshiProviderRepository,'getAuthority'>{
 return Object.freeze({async getAuthority(input){
  const authority=await providers.getAuthority(input),platform=env.TOSHI_DEEPSEEK_API_KEY?.trim();
  if(!platform||authority.provider!=='deepseek')return authority;
  const secret=new TextEncoder().encode(platform),keys=keyring();let merchant:Uint8Array|undefined;
  try{merchant=openMerchantProviderCredential({envelope:authority.sealedCredentials,profileId:authority.configId,storeId:input.tenantContext.store.id,providerCode:'deepseek',capability:'ai_assistant',credentialVersion:authority.credentialVersion,keyring:keys});if(merchant.length===secret.length&&timingSafeEqual(merchant,secret)||new TextDecoder().decode(merchant)==='celebix-toshi-provenance-only-v1')throw unavailable();return authority;}
  finally{merchant?.fill(0);secret.fill(0);keys.keys.forEach(k=>k.key.fill(0));}
 }});
}
