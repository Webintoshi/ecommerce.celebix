import type {GoogleMarketingService,GoogleMarketingSelection,GoogleMarketingConnection,GoogleMarketingOverview,GoogleMarketingResources,PublicGoogleMarketingProjection,TenantContext} from '@celebix/saas-contracts';
import type {PostgresPoolLike,PostgresTimeoutOptions} from '../postgres/pool.ts';
import type {GoogleMarketingCredentialKeyring} from './credential-crypto.ts';
export type GoogleMarketingConfiguration=Readonly<{clientId?:string;clientSecret?:string;panelOrigin?:string;allowedReturnOrigins?:readonly string[];allowReturnOrigin?:(origin:string,context:TenantContext)=>boolean;credentialKeyring?:GoogleMarketingCredentialKeyring;adsProjectId?:string;adsApiVersion?:string}>;
export type GoogleMarketingAuthorityInput=Readonly<{tenantContext:TenantContext;now:Date}>;
export interface GoogleMarketingRepository{
 overview(input:GoogleMarketingAuthorityInput):Promise<GoogleMarketingOverview>;
 begin(input:GoogleMarketingAuthorityInput&Readonly<{service:GoogleMarketingService;operationId:string;sessionBinding:string;returnOrigin:string}>):Promise<{authorizationUrl:string}>;
 resolveOAuthReturn(input:Readonly<{state:string;now:Date}>):Promise<{returnOrigin:string}|null>;
 complete(input:GoogleMarketingAuthorityInput&Readonly<{sessionBinding:string;state:string;code:string}>):Promise<{returnOrigin:string}>;
 resources(input:GoogleMarketingAuthorityInput&Readonly<{service:GoogleMarketingService;accountId?:string}>):Promise<GoogleMarketingResources>;
 apply(input:GoogleMarketingAuthorityInput&Readonly<{service:GoogleMarketingService;expectedVersion:number;selection:GoogleMarketingSelection;operationId:string}>):Promise<GoogleMarketingConnection>;
 disconnect(input:GoogleMarketingAuthorityInput&Readonly<{service:GoogleMarketingService;expectedVersion:number;operationId:string}>):Promise<GoogleMarketingConnection>;
 publicProjection(storeId:string):Promise<PublicGoogleMarketingProjection>;
}
export type PostgresGoogleMarketingRepositoryOptions=Readonly<{pool:PostgresPoolLike;configuration:GoogleMarketingConfiguration;fetch?:typeof fetch;role?:'celebix_saas_app';timeouts?:PostgresTimeoutOptions}>;
