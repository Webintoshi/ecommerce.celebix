import type { MerchantAdminEvent,MerchantAdminJson,MerchantAdminMutationResult,MerchantAdminRecord,MerchantAdminRecordKind,MerchantAdminRecordStatus,TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike,PostgresTimeoutOptions } from "../postgres/pool.ts";
export interface MerchantAdminAuthorityInput {readonly tenantContext:TenantContext;readonly now:Date}
export interface ListMerchantAdminInput extends MerchantAdminAuthorityInput {readonly kind:MerchantAdminRecordKind}
export interface SaveMerchantAdminInput extends ListMerchantAdminInput {readonly operationId:string;readonly recordId?:string;readonly expectedVersion?:number;readonly name:string;readonly config:Readonly<Record<string,MerchantAdminJson>>;readonly status:Exclude<MerchantAdminRecordStatus,"archived">}
export interface ArchiveMerchantAdminInput extends MerchantAdminAuthorityInput {readonly operationId:string;readonly recordId:string;readonly expectedVersion:number}
export interface MerchantAdminRepository {list(input:ListMerchantAdminInput):Promise<readonly MerchantAdminRecord[]>;listEvents(input:ListMerchantAdminInput):Promise<readonly MerchantAdminEvent[]>;save(input:SaveMerchantAdminInput):Promise<MerchantAdminMutationResult>;archive(input:ArchiveMerchantAdminInput):Promise<MerchantAdminMutationResult>}
export interface PostgresMerchantAdminRepositoryOptions {readonly pool:PostgresPoolLike;readonly role:"celebix_saas_app";readonly timeouts:PostgresTimeoutOptions;readonly uuid:()=>string;readonly audit:(event:Readonly<{type:"merchant_admin_commit_unknown"}>)=>void|Promise<void>}
