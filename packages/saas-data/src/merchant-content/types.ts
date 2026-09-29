import type { MerchantContentDocument, MerchantContentKind, MerchantContentVersion, SaveMerchantContentRequest, TenantContext } from '@celebix/saas-contracts';
import type { PostgresPoolLike, PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface MerchantContentAuthorityInput {
    readonly tenantContext: TenantContext;
    readonly now: Date;
}
export interface GetMerchantContentInput extends MerchantContentAuthorityInput {
    readonly kind: MerchantContentKind;
    readonly recordId: string;
}
export interface SaveMerchantContentInput extends MerchantContentAuthorityInput {
    readonly operationId: string;
    readonly request: SaveMerchantContentRequest;
}
export interface ListMerchantContentVersionsInput extends GetMerchantContentInput {
    readonly limit: number;
    readonly beforeVersion?: number;
}
export interface RecoverMerchantContentOperationInput extends MerchantContentAuthorityInput {
    readonly operationId: string;
    readonly fingerprint: string;
}
export interface MerchantContentRepository {
    get(input: GetMerchantContentInput): Promise<MerchantContentDocument>;
    save(input: SaveMerchantContentInput): Promise<{
        readonly document: MerchantContentDocument;
        readonly replayed: boolean;
    }>;
    listVersions(input: ListMerchantContentVersionsInput): Promise<readonly MerchantContentVersion[]>;
    recoverOperation(input: RecoverMerchantContentOperationInput): Promise<{
        readonly document: MerchantContentDocument;
        readonly replayed: true;
    }>;
}
export interface PostgresMerchantContentRepositoryOptions {
    readonly pool: PostgresPoolLike;
    readonly role: 'celebix_saas_app';
    readonly timeouts: PostgresTimeoutOptions;
    readonly audit: (event: Readonly<{
        type: 'merchant_content_commit_unknown';
    }>) => void | Promise<void>;
}
