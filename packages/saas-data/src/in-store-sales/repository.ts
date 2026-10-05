import { createHash } from "node:crypto";
import { parseInStoreBootstrap, parseInStoreProduct, parseInStoreSale, parseInStoreSaleIntent, parseInStoreSalePage, parseInStoreSaleResult, parseInStoreStaffGrant, parseInStorePosCustomer, parseInStorePosCustomerIntent, parseInStorePosCustomerResult, type TenantContext, type InStoreSaleResult, type InStoreSale } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { OrderRepositoryError } from "../orders/errors.ts";
import { resolveProductThumbnails, type ProductThumbnailReference } from "../product-thumbnails.ts";
import { failure, IN_STORE_SALES_ERROR_CODES, inStoreSalesRepositoryErrorCode, type InStoreSalesErrorCode } from "./errors.ts";
import type { InStoreSalesRepository, PostgresInStoreSalesRepositoryOptions, InStoreAuthorityInput, SearchInStoreProductsInput, ListInStoreSalesInput, GetInStoreSaleInput, GetInStoreOperationInput, CreateInStoreSaleInput, UpdateInStoreSaleInput, HoldInStoreSaleInput, PrepareInStoreSaleInput, ConfirmInStorePaymentInput, CancelInStoreSaleInput, VersionedInStoreSaleInput, SetInStoreStaffGrantInput,SearchInStoreCustomersInput,CreateInStoreCustomerInput } from "./types.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function uuid(value: unknown) { if (typeof value !== "string" || !UUID.test(value))
    failure(); return value; }
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    failure(); return value as number; }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> { try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        failure();
    const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]);
    if (required.some(k => !Object.hasOwn(descriptors, k)) || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !allowed.has(k)))
        failure();
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(descriptors)) {
        const d = descriptors[k]!;
        if (!("value" in d) || !d.enumerable)
            failure();
        result[k] = d.value;
    }
    return result;
}
catch {
    failure();
} }
function text(value: unknown, max: number) { if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value))
    failure(); return value; }
function json(value: unknown): string { if (value === null || typeof value !== "object")
    return JSON.stringify(value); if (Array.isArray(value))
    return `[${value.map(json).join(",")}]`; return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${json((value as Record<string, unknown>)[k])}`).join(",")}}`; }
function fingerprint(kind: string, store: string, body: unknown, version:1|2|3=1) { return createHash("sha256").update(json({ version, kind, store, body })).digest("hex"); }
function authority(context: TenantContext, now: Date): ValidatedOrderAuthority { try {
    const role = context.membership?.role;
    if (!["store_owner", "admin", "cashier"].includes(role))
        failure("membership_denied");
    return merchantAuthority(context, now, "orders");
}
catch (error) {
    if (inStoreSalesRepositoryErrorCode(error))
        throw error;
    if (error instanceof OrderRepositoryError && ["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled"].includes(error.code))
        failure(error.code as InStoreSalesErrorCode);
    failure("unavailable");
} }
function values(a: ValidatedOrderAuthority): unknown[] { return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now]; }
const AUTH_CASTS = ["uuid", "uuid", "uuid", "uuid", "text", "bigint", "timestamptz"];
type Spec = {
    name: string;
    args: unknown[];
    casts: string[];
};
type Parser<T> = (value: unknown) => T;
function parsed<T>(parser: Parser<T>, value: unknown): T { try {
    return parser(value);
}
catch {
    failure("unavailable");
} }
function envelope<T>(key: string, parser: Parser<T>, maximum: number) { return (value: unknown) => { const body = exact(value, [key]); if (!Array.isArray(body[key]) || body[key].length > maximum)
    failure("unavailable"); return Object.freeze({ [key]: Object.freeze(body[key].map(v => parsed(parser, v))) }); }; }
export class PostgresInStoreSalesRepository implements InStoreSalesRepository {
    private readonly options: PostgresInStoreSalesRepositoryOptions;
    constructor(options: PostgresInStoreSalesRepositoryOptions) { const o = exact(options, ["pool", "role", "timeouts"]); if (o.role !== "celebix_saas_app" || !o.pool || typeof (o.pool as {
        connect?: unknown;
    }).connect !== "function")
        failure(); const t = exact(o.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]); for (const value of Object.values(t))
        integer(value, 1, 60000); this.options = Object.freeze({pool:o.pool as PostgresInStoreSalesRepositoryOptions["pool"],role:"celebix_saas_app",timeouts:Object.freeze({poolCheckoutMs:t.poolCheckoutMs as number,statementMs:t.statementMs as number,lockMs:t.lockMs as number,idleTransactionMs:t.idleTransactionMs as number})}); }
    private validated(input: InStoreAuthorityInput, required: readonly string[] = [], optional: readonly string[] = []) { const body = exact(input, ["tenantContext", "now", ...required], [...optional,"contractVersion"]); const contractVersion=body.contractVersion===undefined?1:integer(body.contractVersion,1,3) as 1|2|3; const a = authority(body.tenantContext as TenantContext, body.now as Date); return { body, a, contractVersion }; }
    private async acquire() { try {
        return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    }
    catch {
        failure("unavailable");
    } }
    private async configure(c: PostgresClientLike) { const t = this.options.timeouts; await c.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${t.statementMs}ms`]); await c.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${t.lockMs}ms`]); await c.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${t.idleTransactionMs}ms`]); await c.query("SET LOCAL ROLE celebix_saas_app"); }
    private async transact<T>(a: ValidatedOrderAuthority, spec: Spec, parser: Parser<T>, write = false, recovery?: {
        operationId: string;
        fingerprint: string;
        staff?: boolean;customer?:boolean;
        contractVersion?:1|2|3;
    }, hydrate?: (client: PostgresClientLike, value: T) => Promise<T>): Promise<T> { const client = await this.acquire(); let terminal = false, began = false; try {
        await client.query(write ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN READ ONLY");
        began = true;
        await this.configure(client);
        const casts = [...AUTH_CASTS, ...spec.casts], args = [...values(a), ...spec.args];
        const result = await client.query(`SELECT outcome,result_payload FROM saas.${spec.name}(${casts.map((c, i) => `$${i + 1}::${c}`).join(",")})`, args);
        if (result.rows.length !== 1)
            failure("unavailable");
        const row = exact(result.rows[0], ["outcome", "result_payload"]);
        if (typeof row.outcome !== "string")
            failure("unavailable");
        if (IN_STORE_SALES_ERROR_CODES.includes(row.outcome as InStoreSalesErrorCode))
            failure(row.outcome as InStoreSalesErrorCode);
        if (!["found", "committed", "operation_replayed"].includes(row.outcome))
            failure("unavailable");
        const initial = parsed(parser, row.result_payload);
        const value = hydrate ? await hydrate(client, initial) : initial;
        try {
            await client.query("COMMIT");
            terminal = true;
            client.release();
            return value;
        }
        catch {
            terminal = true;
            client.release(true);
            if (write && recovery) {
                const recovered = recovery.customer ? await this.transact(a,{name:"in_store_sales_recover_customer",args:[recovery.operationId,recovery.fingerprint],casts:["uuid","text"]},v=>v===null?null:parseInStorePosCustomerResult(v)) : recovery.staff ? await this.transact(a, { name: "in_store_sales_recover_staff"+(recovery.contractVersion===3?"_v3":recovery.contractVersion===2?"_v2":""), args: [recovery.operationId, recovery.fingerprint], casts: ["uuid", "text"] }, v => v === null ? null : parseInStoreStaffGrant(v,recovery.contractVersion)) : await this.operation(a, recovery.operationId, recovery.fingerprint,recovery.contractVersion);
                if (recovered === null)
                    failure("unavailable");
                return parsed(parser, recovered);
            }
            failure("unavailable");
        }
    }
    catch (error) {
        if (!terminal) {
            try {
                if (began)
                    await client.query("ROLLBACK");
                client.release();
            }
            catch {
                client.release(true);
            }
        }
        if (inStoreSalesRepositoryErrorCode(error))
            throw error;
        failure("unavailable");
    } }
    private async hydrateProducts<T extends {readonly productId:string;readonly variantId:string;readonly imageUrl:string|null}>(client:PostgresClientLike,a:ValidatedOrderAuthority,products:readonly T[]):Promise<readonly T[]> {
        const key=(product:T)=>`${product.productId}:${product.variantId}`;
        const references=new Map<string,ProductThumbnailReference>();
        for(const product of products)if(product.imageUrl===null)references.set(key(product),{key:key(product),productId:product.productId,variantId:product.variantId});
        const refs=[...references.values()],images=new Map<string,string|null>();
        for(let offset=0;offset<refs.length;offset+=5000)for(const [id,image] of await resolveProductThumbnails(client,values(a),"pos",refs.slice(offset,offset+5000)))images.set(id,image);
        return Object.freeze(products.map(product=>Object.freeze({...product,imageUrl:product.imageUrl??images.get(key(product))??null})));
    }
    private async hydrateSales(client:PostgresClientLike,a:ValidatedOrderAuthority,sales:readonly InStoreSale[]):Promise<readonly InStoreSale[]> {
        const products=await this.hydrateProducts(client,a,sales.flatMap(sale=>sale.items));let offset=0;
        return Object.freeze(sales.map(sale=>{const items=Object.freeze(products.slice(offset,offset+sale.items.length));offset+=sale.items.length;return Object.freeze({...sale,items});}));
    }
    private operation(a: ValidatedOrderAuthority, operationId: string, expectedFingerprint: string | null, contractVersion:1|2|3=1) { return this.transact(a, { name: "in_store_sales_get_operation"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [operationId, expectedFingerprint], casts: ["uuid", "text"] }, v => v === null ? null : parseInStoreSaleResult(v,contractVersion)); }
    private mutate(input: VersionedInStoreSaleInput, kind: string, extra: Record<string, unknown> = {}, casts: string[] = [], args: unknown[] = []) { const { a, body, contractVersion } = this.validated(input, ["operationId", "saleId", "expectedVersion", ...Object.keys(extra)]); const operationId = uuid(body.operationId), saleId = uuid(body.saleId), expectedVersion = integer(body.expectedVersion, 1); const hash = fingerprint(kind, a.storeId, { saleId, expectedVersion, ...extra },contractVersion); return this.transact(a, { name: `in_store_sales_${kind}${contractVersion===3?"_v3":contractVersion===2?"_v2":""}`, args: [operationId, hash, saleId, expectedVersion, ...args], casts: ["uuid", "text", "uuid", "bigint", ...casts] }, v => { const result = parseInStoreSaleResult(v,contractVersion); if (result.sale.id !== saleId)
        failure("unavailable"); return result; }, true, { operationId, fingerprint: hash,contractVersion }); }
    async bootstrap(input: InStoreAuthorityInput) { const { a, contractVersion } = this.validated(input); return this.transact(a, { name: "in_store_sales_bootstrap"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [], casts: [] }, v=>parseInStoreBootstrap(v,contractVersion),false,undefined,async(client,value)=>{
        const groups=[...(value.activeDraft?[value.activeDraft]:[]),...value.heldSales,...value.pendingSales,...value.recentSales];const sales=await this.hydrateSales(client,a,groups);let offset=0;
        const activeDraft=value.activeDraft?sales[offset++]!:null;const heldSales=Object.freeze(sales.slice(offset,offset+=value.heldSales.length));const pendingSales=Object.freeze(sales.slice(offset,offset+=value.pendingSales.length));const recentSales=Object.freeze(sales.slice(offset));
        return Object.freeze({...value,activeDraft,heldSales,pendingSales,recentSales});
    }); }
    async searchProducts(input: SearchInStoreProductsInput) { const { a, body, contractVersion } = this.validated(input, ["locationId", "limit"], ["barcode", "query"]); if (Object.hasOwn(body, "barcode") === Object.hasOwn(body, "query"))
        failure(); const locationId = uuid(body.locationId), limit = integer(body.limit, 1, 20), barcode = body.barcode === undefined ? null : text(body.barcode, 128), query = body.query === undefined ? null : text(body.query, 100); return this.transact(a, { name: "in_store_sales_search_products", args: [locationId, barcode, query, limit], casts: ["uuid", "text", "text", "integer"] }, envelope("products", parseInStoreProduct, 20),false,undefined,async(client,value)=>Object.freeze({products:await this.hydrateProducts(client,a,value.products)})) as ReturnType<InStoreSalesRepository["searchProducts"]>; }
    async listSales(input: ListInStoreSalesInput) { const { a, body, contractVersion } = this.validated(input, ["status", "pageSize"], ["cursor"]); if (!["draft", "held", "pending", "completed"].includes(body.status as string))
        failure(); const pageSize = integer(body.pageSize, 1, 50); const cursor = body.cursor == null ? null : text(body.cursor, 512); return this.transact(a, { name: "in_store_sales_list"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [body.status, pageSize, cursor], casts: ["text", "integer", "text"] }, v=>parseInStoreSalePage(v,contractVersion),false,undefined,async(client,value)=>Object.freeze({...value,sales:await this.hydrateSales(client,a,value.sales)})); }
    async getSale(input: GetInStoreSaleInput) { const { a, body, contractVersion } = this.validated(input, ["saleId"]); const saleId = uuid(body.saleId); return this.transact(a, { name: "in_store_sales_get"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [saleId], casts: ["uuid"] }, v => { const result = parseInStoreSale(v,contractVersion); if (result.id !== saleId)
        failure("unavailable"); return result; },false,undefined,async(client,value)=>(await this.hydrateSales(client,a,[value]))[0]!); }
    async getOperation(input: GetInStoreOperationInput) { const { a, body, contractVersion } = this.validated(input, ["operationId"]); return this.operation(a, uuid(body.operationId), null,contractVersion); }
    async createSale(input: CreateInStoreSaleInput) { const { a, body, contractVersion } = this.validated(input, ["operationId", "saleId", "intent"]); const operationId = uuid(body.operationId), saleId = uuid(body.saleId); let intent; try {
        intent = parseInStoreSaleIntent(body.intent,contractVersion);
    }
    catch {
        failure();
    } const hash = fingerprint("create", a.storeId, { saleId, intent },contractVersion); return this.transact(a, { name: "in_store_sales_create"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [operationId, hash, saleId, JSON.stringify(intent)], casts: ["uuid", "text", "uuid", "jsonb"] }, v => { const result = parseInStoreSaleResult(v,contractVersion); if (result.sale.id !== saleId)
        failure("unavailable"); return result; }, true, { operationId, fingerprint: hash,contractVersion }); }
    async updateSale(input: UpdateInStoreSaleInput) { let intent; try {
        const validated=this.validated(input, ["operationId", "saleId", "expectedVersion", "intent"]);intent = parseInStoreSaleIntent(validated.body.intent,validated.contractVersion);
    }
    catch {
        failure();
    } return this.mutate(input, "update", { intent }, ["jsonb"], [JSON.stringify(intent)]); }
    async holdSale(input: HoldInStoreSaleInput) { const held = this.validated(input, ["operationId", "saleId", "expectedVersion", "held"]).body.held; if (typeof held !== "boolean")
        failure(); return this.mutate(input, "hold", { held }, ["boolean"], [held]); }
    async prepareSale(input: PrepareInStoreSaleInput) { const expectedTotalCents = integer(this.validated(input, ["operationId", "saleId", "expectedVersion", "expectedTotalCents"]).body.expectedTotalCents, 1); return this.mutate(input, "prepare", { expectedTotalCents }, ["bigint"], [expectedTotalCents]); }
    async confirmPayment(input: ConfirmInStorePaymentInput) { const {body,contractVersion}=this.validated(input, ["operationId", "saleId", "expectedVersion", "slipReference"],["paymentMethod"]);const value=body.slipReference; const slipReference = value === null ? null : text(value, 100);if(contractVersion===1){if(Object.hasOwn(body,"paymentMethod"))failure();return this.mutate(input,"confirm_payment",{slipReference},["text"],[slipReference]);}const paymentMethod=body.paymentMethod;if(paymentMethod!==null&&paymentMethod!=="card"&&paymentMethod!=="cash"&&!(contractVersion===3&&paymentMethod==="bank_transfer"))failure();return this.mutate(input,"confirm_payment",{slipReference,paymentMethod},["text","text"],[slipReference,paymentMethod]); }
    async completeSale(input: VersionedInStoreSaleInput) { return this.mutate(input, "complete"); }
    async cancelSale(input: CancelInStoreSaleInput) { if (this.validated(input, ["operationId", "saleId", "expectedVersion", "confirmUnpaid"]).body.confirmUnpaid !== true)
        failure(); return this.mutate(input, "cancel", { confirmUnpaid: true }, ["boolean"], [true]); }
    async discardSale(input: CancelInStoreSaleInput) { if (this.validated(input, ["operationId", "saleId", "expectedVersion", "confirmUnpaid"]).body.confirmUnpaid !== true)
        failure(); return this.mutate(input, "discard", { confirmUnpaid: true }, ["boolean"], [true]); }
    async takeoverSale(input: VersionedInStoreSaleInput) { return this.mutate(input, "takeover"); }
    async listStaff(input: InStoreAuthorityInput) { const { a, contractVersion } = this.validated(input); return this.transact(a, { name: "in_store_sales_list_staff"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [], casts: [] }, envelope("staff", v=>parseInStoreStaffGrant(v,contractVersion), 100)) as ReturnType<InStoreSalesRepository["listStaff"]>; }
    async setStaffGrant(input: SetInStoreStaffGrantInput) { const { a, body, contractVersion } = this.validated(input, ["operationId", "membershipId", "expectedVersion", "enabled", "locationIds", "discountLimitBps"],["canEditPrice","canSellOnCredit","canCollectReceivables"]); const operationId = uuid(body.operationId), membershipId = uuid(body.membershipId), expectedVersion = integer(body.expectedVersion, 0), discountLimitBps = integer(body.discountLimitBps, 0, 9999); if (typeof body.enabled !== "boolean" || !Array.isArray(body.locationIds) || body.locationIds.length > 100)
        failure(); const locationIds = body.locationIds.map(uuid); if (new Set(locationIds).size !== locationIds.length)
        failure(); const extra=contractVersion>=2?{canEditPrice:body.canEditPrice,...(contractVersion===3?{canSellOnCredit:body.canSellOnCredit,canCollectReceivables:body.canCollectReceivables}:{})}:{};if(contractVersion>=2?typeof body.canEditPrice!=="boolean":Object.hasOwn(body,"canEditPrice"))failure();if(contractVersion===3?typeof body.canSellOnCredit!=="boolean"||typeof body.canCollectReceivables!=="boolean":Object.hasOwn(body,"canSellOnCredit")||Object.hasOwn(body,"canCollectReceivables"))failure();const hash = fingerprint("set_staff", a.storeId, { membershipId, expectedVersion, enabled: body.enabled, locationIds: [...locationIds].sort(), discountLimitBps,...extra },contractVersion); return this.transact(a, { name: "in_store_sales_set_staff"+(contractVersion===3?"_v3":contractVersion===2?"_v2":""), args: [operationId, hash, membershipId, expectedVersion, body.enabled, locationIds, discountLimitBps,...(contractVersion>=2?[body.canEditPrice]:[]),...(contractVersion===3?[body.canSellOnCredit,body.canCollectReceivables]:[])], casts: ["uuid", "text", "uuid", "bigint", "boolean", "uuid[]", "integer",...(contractVersion>=2?["boolean"]:[]),...(contractVersion===3?["boolean","boolean"]:[])] }, v => { const result = parseInStoreStaffGrant(v,contractVersion); if (result.membershipId !== membershipId)
        failure("unavailable"); return result; }, true, { operationId, fingerprint: hash, staff: true,contractVersion }); }
    async searchCustomers(input:SearchInStoreCustomersInput){const {a,body}=this.validated(input,["query","limit"]);return this.transact(a,{name:"in_store_sales_search_customers",args:[text(body.query,100),integer(body.limit,1,20)],casts:["text","integer"]},envelope("customers",parseInStorePosCustomer,20)) as ReturnType<InStoreSalesRepository["searchCustomers"]>;}
    async createCustomer(input:CreateInStoreCustomerInput){const {a,body}=this.validated(input,["operationId","intent"]);const operationId=uuid(body.operationId);let intent;try{intent=parseInStorePosCustomerIntent(body.intent);}catch{failure();}const hash=fingerprint("create_customer",a.storeId,{intent},3);return this.transact(a,{name:"in_store_sales_create_customer",args:[operationId,hash,JSON.stringify(intent)],casts:["uuid","text","jsonb"]},parseInStorePosCustomerResult,true,{operationId,fingerprint:hash,customer:true});}

}
