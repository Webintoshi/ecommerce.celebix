import type { EmailMarketingProvider } from '@celebix/saas-contracts';
export type EmailMarketingCredentialBinding = Readonly<{storeId: string; credentialOwnerId: string; provider: EmailMarketingProvider; purpose: 'candidate' | 'connection' | 'webhook'; credentialVersion: number}>;
export type SealedEmailMarketingCredential = Readonly<{algorithm: 'A256GCM'; version: 1; keyId: string; iv: string; tag: string; ciphertext: string}>;

import type {TenantContext, EmailMarketingAccount, EmailMarketingList, EmailMarketingConnection, EmailMarketingOverview, EmailMarketingSelection, EmailMarketingAudiencePreview} from '@celebix/saas-contracts';
import type {PostgresPoolLike, PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {MerchantProviderCredentialKeyring} from '../provider-execution/credential-crypto.ts';
export type EmailMarketingAuthorityInput=Readonly<{tenantContext:TenantContext;now:Date}>;
export type EmailMarketingCandidate=Readonly<{candidateId:string;provider:EmailMarketingProvider;accountId:string;accountName:string;expiresAt:string}>;
export type EmailMarketingListPage=Readonly<{items:readonly EmailMarketingList[];nextCursor?:string}>;
export type EmailMarketingProviderResult<T>=Readonly<{kind:'verified';value:T}>|Readonly<{kind:'accepted'|'unknown';providerReference?:string}>;
export interface EmailMarketingConnectionAdapter {
 account(apiKey:string):Promise<EmailMarketingAccount>;
 lists(apiKey:string,cursor?:string):Promise<EmailMarketingListPage>;
 createList(apiKey:string,name:string):Promise<EmailMarketingProviderResult<EmailMarketingList>>;
}
type CandidateInput=EmailMarketingAuthorityInput&Readonly<{candidateId:string;sessionBinding:string}>;
type MutationInput=EmailMarketingAuthorityInput&Readonly<{expectedVersion:number;operationId:string}>;
export interface EmailMarketingConnectionRepository {
 overview(a:EmailMarketingAuthorityInput):Promise<EmailMarketingOverview>;
 validate(a:EmailMarketingAuthorityInput&Readonly<{provider:EmailMarketingProvider;apiKey:string;sessionBinding:string;operationId:string}>):Promise<EmailMarketingCandidate>;
 lists(a:CandidateInput&Readonly<{cursor?:string}>):Promise<EmailMarketingListPage>;
 preview(a:CandidateInput&Readonly<{listId?:string}>):Promise<EmailMarketingAudiencePreview>;
 apply(a:CandidateInput&MutationInput&Readonly<{selection:EmailMarketingSelection}>):Promise<EmailMarketingConnection>;
 rotate(a:CandidateInput&MutationInput):Promise<EmailMarketingConnection>;
 recheck(a:MutationInput):Promise<EmailMarketingConnection>;
 sync(a:MutationInput):Promise<EmailMarketingConnection>;
 disconnect(a:MutationInput):Promise<EmailMarketingConnection>;
}
export type PostgresEmailMarketingConnectionOptions=Readonly<{pool:PostgresPoolLike;role:'celebix_saas_app';timeouts:PostgresTimeoutOptions;keyring:MerchantProviderCredentialKeyring;providers:Readonly<Record<EmailMarketingProvider,EmailMarketingConnectionAdapter>>;uuid:()=>string}>;
