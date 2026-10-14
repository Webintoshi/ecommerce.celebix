import type {TenantContext,GoogleMerchantOverview,GoogleMerchantProducts,GoogleMerchantSyncResult,GoogleMerchantOffer,GoogleMerchantIssue,GoogleMerchantAttributes,GoogleMerchantIdentityInput} from '@celebix/saas-contracts';
import type {PostgresPoolLike,PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {SealedGoogleCredential} from '../google-marketing/credential-crypto.ts';
export type GoogleMerchantAuthority=Readonly<{tenantContext:TenantContext;now:Date}>;
export interface GoogleMerchantRepository{
 overview(input:GoogleMerchantAuthority&Readonly<{includeIdentity?:true}>):Promise<GoogleMerchantOverview>;
 products(input:GoogleMerchantAuthority&Readonly<{cursor?:string;limit?:number}>):Promise<GoogleMerchantProducts>;
 sync(input:GoogleMerchantAuthority&Readonly<{operationId:string}>):Promise<GoogleMerchantSyncResult>;
 setIdentityProfile(input:GoogleMerchantAuthority&GoogleMerchantIdentityInput&Readonly<{operationId:string}>):Promise<Readonly<{saved:true;replayed:boolean}>>;
 setProductPreferences(input:GoogleMerchantAuthority&Readonly<{operationId:string;productId:string;variantId:string;enabled:boolean;attributes?:GoogleMerchantAttributes}>):Promise<Readonly<{saved:true;replayed:boolean}>>;
}
export type PostgresGoogleMerchantRepositoryOptions=Readonly<{pool:PostgresPoolLike;timeouts?:PostgresTimeoutOptions}>;
export type GoogleMerchantJob=Readonly<{storeId:string;productId:string;variantId:string;generation:number;connectionVersion:number;leaseId:string;accountId:string;dataSourceId:string;domain:string;credential:SealedGoogleCredential;projection:GoogleMerchantOffer|null;issues:readonly GoogleMerchantIssue[];action:'upsert'|'delete'|'status';renewal:boolean;googleProductId:string|null}>;
export interface GoogleMerchantJobRepository{
 claim(input:Readonly<{now:Date;limit:number;leaseId:string}>):Promise<readonly GoogleMerchantJob[]>;
 read(input:Readonly<{job:GoogleMerchantJob;now:Date}>):Promise<GoogleMerchantJob|null>;
 finish(input:Readonly<{job:GoogleMerchantJob;now:Date;result:'submitted'|'pending'|'withdrawn'|'approved'|'limited'|'disapproved'|'excluded';googleProductId?:string;issues?:readonly GoogleMerchantIssue[]}>):Promise<'finished'|'stale'>;
 defer(input:Readonly<{job:GoogleMerchantJob;now:Date;code:string;retryAfterSeconds?:number}>):Promise<'retry'|'failed'|'stale'>;
 saveCredential(input:Readonly<{job:GoogleMerchantJob;now:Date;credential:SealedGoogleCredential;subject:string}>):Promise<'saved'|'stale'>;
}
