import type { InStoreBootstrap, InStoreProduct, InStoreSale, InStoreSaleIntent, InStoreSalePage, InStoreSaleResult, InStoreStaffGrant, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
export interface InStoreAuthorityInput {
    readonly tenantContext: TenantContext;
    readonly now: Date;
}
export interface SearchInStoreProductsInput extends InStoreAuthorityInput {
    readonly locationId: string;
    readonly barcode?: string;
    readonly query?: string;
    readonly limit: number;
}
export interface ListInStoreSalesInput extends InStoreAuthorityInput {
    readonly status: "draft" | "held" | "pending" | "completed";
    readonly pageSize: number;
    readonly cursor?: string | null;
}
export interface GetInStoreSaleInput extends InStoreAuthorityInput {
    readonly saleId: string;
}
export interface GetInStoreOperationInput extends InStoreAuthorityInput {
    readonly operationId: string;
}
export interface CreateInStoreSaleInput extends GetInStoreSaleInput {
    readonly operationId: string;
    readonly intent: InStoreSaleIntent;
}
export interface VersionedInStoreSaleInput extends GetInStoreSaleInput {
    readonly operationId: string;
    readonly expectedVersion: number;
}
export interface UpdateInStoreSaleInput extends VersionedInStoreSaleInput {
    readonly intent: InStoreSaleIntent;
}
export interface HoldInStoreSaleInput extends VersionedInStoreSaleInput {
    readonly held: boolean;
}
export interface PrepareInStoreSaleInput extends VersionedInStoreSaleInput {
    readonly expectedTotalCents: number;
}
export interface ConfirmInStorePaymentInput extends VersionedInStoreSaleInput {
    readonly slipReference: string | null;
}
export interface CancelInStoreSaleInput extends VersionedInStoreSaleInput {
    readonly confirmUnpaid: true;
}
export interface SetInStoreStaffGrantInput extends InStoreAuthorityInput {
    readonly operationId: string;
    readonly membershipId: string;
    readonly expectedVersion: number;
    readonly enabled: boolean;
    readonly locationIds: readonly string[];
    readonly discountLimitBps: number;
}
export interface InStoreSalesRepository {
    bootstrap(input: InStoreAuthorityInput): Promise<InStoreBootstrap>;
    searchProducts(input: SearchInStoreProductsInput): Promise<Readonly<{
        products: readonly InStoreProduct[];
    }>>;
    listSales(input: ListInStoreSalesInput): Promise<InStoreSalePage>;
    getSale(input: GetInStoreSaleInput): Promise<InStoreSale>;
    getOperation(input: GetInStoreOperationInput): Promise<InStoreSaleResult | null>;
    createSale(input: CreateInStoreSaleInput): Promise<InStoreSaleResult>;
    updateSale(input: UpdateInStoreSaleInput): Promise<InStoreSaleResult>;
    holdSale(input: HoldInStoreSaleInput): Promise<InStoreSaleResult>;
    prepareSale(input: PrepareInStoreSaleInput): Promise<InStoreSaleResult>;
    confirmPayment(input: ConfirmInStorePaymentInput): Promise<InStoreSaleResult>;
    completeSale(input: VersionedInStoreSaleInput): Promise<InStoreSaleResult>;
    cancelSale(input: CancelInStoreSaleInput): Promise<InStoreSaleResult>;
    takeoverSale(input: VersionedInStoreSaleInput): Promise<InStoreSaleResult>;
    listStaff(input: InStoreAuthorityInput): Promise<Readonly<{
        staff: readonly InStoreStaffGrant[];
    }>>;
    setStaffGrant(input: SetInStoreStaffGrantInput): Promise<InStoreStaffGrant>;
}
export interface PostgresInStoreSalesRepositoryOptions {
    readonly pool: PostgresPoolLike;
    readonly role: "celebix_saas_app";
    readonly timeouts: PostgresTimeoutOptions;
}
