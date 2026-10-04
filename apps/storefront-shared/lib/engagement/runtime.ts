import { parseStoreEngagementCaptureRequest, parseStoreEngagementCaptureResult, parseStoreEngagementPublicSettings, type StoreEngagementCaptureRequest, type StoreEngagementCaptureResult, type StoreEngagementPublicSettings } from '@celebix/saas-contracts';
import { credentialDigestCandidates, readStorefrontCredentialCookie, type StorefrontCommerceCredentialKeyring } from '../cart/credential.ts';
type Repository=Readonly<{publicSettings(input:Readonly<{hostname:string;now:Date}>):Promise<StoreEngagementPublicSettings>;capture(input:StoreEngagementCaptureRequest&Readonly<{hostname:string;cartTokenDigest:string;now:Date}>):Promise<StoreEngagementCaptureResult>}>;
export class StoreEngagementRuntimeError extends Error {readonly code='invalid_input';constructor(){super('store_engagement_invalid_request');this.name='StoreEngagementRuntimeError';}}
export function createStoreEngagementRuntime(deps:Readonly<{repository:Repository;keyring:StorefrontCommerceCredentialKeyring;now():Date}>){
 return Object.freeze({
  async publicSettings(hostname:string){return parseStoreEngagementPublicSettings(await deps.repository.publicSettings({hostname,now:deps.now()}));},
  async capture(hostname:string,cookieHeader:string|null,raw:unknown){
   const input=parseStoreEngagementCaptureRequest(raw),credential=readStorefrontCredentialCookie('cart',cookieHeader);
   if(credential.kind!=='present')throw new StoreEngagementRuntimeError();
   const candidates=credentialDigestCandidates('cart',credential.value,deps.keyring);if(candidates.length!==1)throw new StoreEngagementRuntimeError();
   return parseStoreEngagementCaptureResult(await deps.repository.capture({hostname,cartTokenDigest:candidates[0]!.digest,now:deps.now(),...input}));
  },
 });
}
export type StoreEngagementRuntime=ReturnType<typeof createStoreEngagementRuntime>;
