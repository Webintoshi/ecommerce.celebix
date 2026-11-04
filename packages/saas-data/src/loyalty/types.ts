import type {TenantContext,LoyaltyAdminAction,LoyaltyAdminPayloadMap,LoyaltyAdminResultMap,LoyaltyCustomerAction,LoyaltyCustomerPayloadMap,LoyaltyCustomerResultMap} from '@celebix/saas-contracts';
import type {PostgresPoolLike,PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {StorefrontCredentialCandidate} from '../storefront-commerce/types.ts';
export type LoyaltyAuthorityInput=Readonly<{tenantContext:TenantContext;now:Date}>;
export type LoyaltyAdminCommandInput<A extends LoyaltyAdminAction>=LoyaltyAuthorityInput&Readonly<{action:A;payload:LoyaltyAdminPayloadMap[A];operationId?:string}>;
export interface LoyaltyRepository{
 command<A extends LoyaltyAdminAction>(input:LoyaltyAdminCommandInput<A>):Promise<LoyaltyAdminResultMap[A]>;
 recover<A extends LoyaltyAdminAction>(input:LoyaltyAdminCommandInput<A>&Readonly<{operationId:string}>):Promise<LoyaltyAdminResultMap[A]|null>;
}
export type LoyaltyCustomerCommandInput<A extends LoyaltyCustomerAction>=Readonly<{hostname:string;now:Date;candidates:readonly StorefrontCredentialCandidate[];action:A;payload:LoyaltyCustomerPayloadMap[A];operationId?:string}>;
export interface LoyaltyCustomerRepository{
 command<A extends LoyaltyCustomerAction>(input:LoyaltyCustomerCommandInput<A>):Promise<LoyaltyCustomerResultMap[A]>;
 recover<A extends LoyaltyCustomerAction>(input:LoyaltyCustomerCommandInput<A>&Readonly<{operationId:string}>):Promise<LoyaltyCustomerResultMap[A]|null>;
}
export type PostgresLoyaltyRepositoryOptions=Readonly<{pool:PostgresPoolLike;role:'celebix_saas_app';timeouts:PostgresTimeoutOptions}>;
export type PostgresLoyaltyCustomerRepositoryOptions=Readonly<{pool:PostgresPoolLike;role:'celebix_saas_host_resolver';timeouts:PostgresTimeoutOptions}>;
