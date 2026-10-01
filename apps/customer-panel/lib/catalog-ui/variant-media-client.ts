import { parseProductVariantGallery, parseProductVariantGalleryAssignments, type ProductVariantGallery, type ProductVariantGalleryAssignment } from "../../../../packages/saas-contracts/src/media/variant-gallery.ts";
import { ProductMediaApiError, type ProductMediaApiErrorCode } from "./media-client.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const codes = new Set<ProductMediaApiErrorCode>(["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "product_not_found", "variant_not_found", "media_not_found", "media_limit_reached", "version_conflict", "operation_mismatch", "origin_denied", "unavailable"]);
export class ProductVariantMediaApiError extends ProductMediaApiError {
    constructor(code: ProductMediaApiErrorCode, status: number) {
        super(code, status);
        this.name = "ProductVariantMediaApiError";
        if (code === "version_conflict")
            this.message = "Galeri başka bir işlemde güncellendi. Seçiminiz korunuyor; güncel sürümü yükleyip tekrar uygulayın.";
        else if (code === "invalid_input")
            this.message = "Geçerli ürün görsellerini ve varyantları seçin. Her galeri en fazla 16 görsel içerebilir.";
        else if (code === "unavailable")
            this.message = "Galeri kaydedilemedi. Seçiminiz korunuyor; tekrar deneyin.";
    }
}
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function id(value: string) { if (!UUID.test(value))
    throw new TypeError("variant_media_client_invalid"); return value; }
function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function createProductVariantMediaClient(options?: Readonly<{
    fetch?: Fetch;
}>) {
    const fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
    async function request(productId: string, init: RequestInit) {
        let response: Response;
        try {
            response = await fetchImpl(`/api/catalog/products/${id(productId)}/variant-media`, { credentials: "same-origin", ...init });
        }
        catch (failure) {
            if (failure instanceof TypeError && failure.message === "variant_media_client_invalid")
                throw failure;
            throw new ProductVariantMediaApiError("unavailable", 503);
        }
        let data: Record<string, unknown> | null = null;
        try {
            if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json")
                data = object(await response.json());
        }
        catch { }
        if (!response.ok) {
            const code = data?.code;
            throw new ProductVariantMediaApiError(typeof code === "string" && codes.has(code as ProductMediaApiErrorCode) ? code as ProductMediaApiErrorCode : "unavailable", response.status);
        }
        if (data === null)
            throw new ProductVariantMediaApiError("unavailable", 503);
        let gallery: ProductVariantGallery;
        try {
            gallery = parseProductVariantGallery(data.gallery);
        }
        catch {
            throw new ProductVariantMediaApiError("unavailable", 503);
        }
        if (gallery.productId !== productId)
            throw new ProductVariantMediaApiError("unavailable", 503);
        return { data, gallery };
    }
    return Object.freeze({
        async list(productId: string): Promise<ProductVariantGallery> { return (await request(id(productId), { method: "GET", cache: "no-store" })).gallery; },
        async save(productId: string, input: Readonly<{
            expectedVersion: number;
            assignments: readonly ProductVariantGalleryAssignment[];
            operationId: string;
        }>): Promise<Readonly<{
            gallery: ProductVariantGallery;
            replayed: boolean;
        }>> {
            id(productId);
            id(input.operationId);
            if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
                throw new TypeError("variant_media_client_invalid");
            const assignments = parseProductVariantGalleryAssignments(input.assignments);
            const { data, gallery } = await request(productId, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": input.operationId }, body: JSON.stringify({ expectedVersion: input.expectedVersion, assignments }) });
            if (typeof data.replayed !== "boolean")
                throw new ProductVariantMediaApiError("unavailable", 503);
            return Object.freeze({ gallery, replayed: data.replayed });
        },
    });
}
export const productVariantMediaApi = createProductVariantMediaClient();
