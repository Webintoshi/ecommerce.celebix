import {parseTrendyolSellerId,parseTrendyolSecret,trendyolInteger,trendyolObject,trendyolUuid} from '@celebix/saas-contracts';
import {sealMerchantProviderCredential,openMerchantProviderCredential,type MerchantProviderCredentialKeyring,type SealedMerchantProviderCredential} from '../provider-execution/credential-crypto.ts';

export type PrivateTrendyolCredential=Readonly<{sellerId:string;apiKey:string;apiSecret:string;webhookSecret:string}>;
export function parseTrendyolSealedCredential(value:unknown):SealedMerchantProviderCredential{
  const v=trendyolObject(value,['algorithm','ciphertext','iv','keyId','tag','version']);
  if(v.algorithm!=='A256GCM'||v.version!==1||typeof v.keyId!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(v.keyId))throw TypeError('trendyol_credential_invalid');
  for(const key of['iv','tag','ciphertext'])if(typeof v[key]!=='string'||!v[key]||v[key].length>24000||!/^[A-Za-z0-9_-]+$/.test(v[key] as string))throw TypeError('trendyol_credential_invalid');
  if(Buffer.from(v.iv as string,'base64url').length!==12||Buffer.from(v.tag as string,'base64url').length!==16)throw TypeError('trendyol_credential_invalid');
  return Object.freeze(v) as SealedMerchantProviderCredential;
}
function parsePrivate(value:unknown):PrivateTrendyolCredential{
  const v=trendyolObject(value,['sellerId','apiKey','apiSecret','webhookSecret']);
  if(typeof v.webhookSecret!=='string'||!/^[a-f0-9]{64}$/.test(v.webhookSecret))throw TypeError('trendyol_credential_invalid');
  return Object.freeze({sellerId:parseTrendyolSellerId(v.sellerId),apiKey:parseTrendyolSecret(v.apiKey),apiSecret:parseTrendyolSecret(v.apiSecret),webhookSecret:v.webhookSecret});
}
function context(storeId:string,version:number){return{profileId:trendyolUuid(storeId),storeId,providerCode:'trendyol',capability:'marketplace_sync' as const,credentialVersion:trendyolInteger(version,1,Number.MAX_SAFE_INTEGER)};}
export function sealTrendyolCredential(input:Readonly<{storeId:string;version:number;credential:PrivateTrendyolCredential;keyring:MerchantProviderCredentialKeyring}>):SealedMerchantProviderCredential{
  const plaintext=Buffer.from(JSON.stringify(parsePrivate(input.credential)),'utf8');
  try{return sealMerchantProviderCredential({...context(input.storeId,input.version),plaintext,keyring:input.keyring});}finally{plaintext.fill(0);}
}
export function openTrendyolCredential(input:Readonly<{storeId:string;version:number;envelope:SealedMerchantProviderCredential;keyring:MerchantProviderCredentialKeyring}>):PrivateTrendyolCredential{
  const plaintext=openMerchantProviderCredential({...context(input.storeId,input.version),envelope:parseTrendyolSealedCredential(input.envelope),keyring:input.keyring});
  try{return parsePrivate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext)));}finally{plaintext.fill(0);}
}
