import type { ProductVariantGalleryAssignment } from "@celebix/saas-contracts";
type Attributes = Readonly<Record<string, string>>;
type Draft = Readonly<{
    attributes: Attributes;
    sku?: string;
    barcode?: string;
    mediaIds?: readonly string[];
}>;
type Created = Readonly<{
    id: string;
    attributes: Attributes;
    sku?: string;
    barcode?: string;
}>;
function sameAttributes(left: Attributes, right: Attributes) { const keys = Object.keys(left); return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && left[key] === right[key]); }
/** Creation responses can be reordered; titles are never an identity or attribute source. */
export function mapDraftVariantGalleries(drafts: readonly Draft[], created: readonly Created[], mediaIdsByLocalId: Readonly<Record<string, string>>): readonly ProductVariantGalleryAssignment[] {
    return Object.freeze(drafts.flatMap(draft => {
        if (draft.mediaIds === undefined)
            return [];
        const matches = created.filter(item => sameAttributes(draft.attributes, item.attributes) && (!draft.sku?.trim() || item.sku === draft.sku.trim()) && (!draft.barcode?.trim() || item.barcode === draft.barcode.trim()));
        if (matches.length !== 1)
            throw new Error("Görsel atanacak varyant doğrulanamadı. Ürün sayfasından devam edin.");
        const mediaIds = draft.mediaIds.map(localId => { const id = mediaIdsByLocalId[localId]; if (!id)
            throw new Error("Seçilen görsel henüz yüklenmedi. Yüklemeyi tekrar deneyin."); return id; });
        if (mediaIds.length > 16 || new Set(mediaIds).size !== mediaIds.length)
            throw new Error("Her varyant için en fazla 16 farklı görsel seçin.");
        return [Object.freeze({ variantId: matches[0]!.id, mediaIds: Object.freeze(mediaIds) })];
    }));
}
