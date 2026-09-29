import 'server-only';
import { createHash } from 'node:crypto';
import { canonicalContentAuthoringValue, parseContentAuthoringProductSnapshot, parseContentAuthoringRequest } from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import type { ContentAuthoringProductSnapshot, ContentAuthoringRequest, ProductFact, ProductFactPacket } from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
export interface ContentAuthoringTenantReferenceResolver {
    category(id: string): Readonly<{
        id: string;
        name: string;
    }> | null;
    brand(id: string): Readonly<{
        id: string;
        name: string;
    }> | null;
    attribute(id: string): Readonly<{
        id: string;
        name: string;
    }> | null;
    variant(id: string): Readonly<{
        id: string;
        productId: string;
    }> | null;
}
export interface ContentAuthoringSavedProduct {
    readonly id?: string;
    readonly title: string;
    readonly [key: string]: unknown;
}
const digest = (v: unknown) => createHash('sha256').update(canonicalContentAuthoringValue(v)).digest('hex');
export function fingerprintContentAuthoringRequest(request: ContentAuthoringRequest): string { return digest(parseContentAuthoringRequest(request)); }
function decimal(milli: number): string { const whole = Math.floor(milli / 1000), remainder = milli % 1000; return remainder ? `${whole}.${String(remainder).padStart(3, '0').replace(/0+$/, '')}` : String(whole); }
/** Resolver methods must query the authenticated tenant; missing/foreign IDs fail closed. */
export function buildProductFactPacket(savedProduct: ContentAuthoringSavedProduct | null, currentDraft: ContentAuthoringProductSnapshot, resolver: ContentAuthoringTenantReferenceResolver): ProductFactPacket { const snapshot = parseContentAuthoringProductSnapshot(currentDraft); const facts: ProductFact[] = []; const add = (field: string, value: string, source: ProductFact['source'] = 'current_draft', unit?: string, variantId?: string) => facts.push({ ref: `${variantId ? `variant:${variantId}:` : 'product:'}${field}:${facts.length}`, field, value, source, scope: variantId ? 'variant' : 'product', ...(unit ? { unit } : {}), ...(variantId ? { variantId } : {}) }); const resolve = (kind: 'category' | 'brand' | 'attribute', id: string) => { const reference = resolver[kind](id); if (!reference || reference.id !== id || !reference.name.trim())
    throw new TypeError('content_authoring_reference_invalid'); return reference.name; }; add('title', snapshot.title); for (const id of snapshot.categoryIds ?? [])
    add('category', resolve('category', id), 'tenant_reference'); if (snapshot.brandId)
    add('brand', resolve('brand', snapshot.brandId), 'tenant_reference'); const attributes = (a: ContentAuthoringProductSnapshot['attributes'], variantId?: string) => { for (const x of a ?? [])
    add(resolve('attribute', x.attributeId), x.value, 'tenant_reference', undefined, variantId); }; const measurements = (m: ContentAuthoringProductSnapshot['measurements'], variantId?: string) => { for (const [key, value] of Object.entries(m ?? {})) {
    if (typeof value === 'number')
        add(key, String(value), 'current_draft', undefined, variantId);
    else
        add(key, decimal(value.valueMilli), 'current_draft', value.unit, variantId);
} }; attributes(snapshot.attributes); measurements(snapshot.measurements); snapshot.variants?.forEach((variant, i) => { if (variant.id) {
    const reference = resolver.variant(variant.id);
    if (!reference || reference.id !== variant.id || !savedProduct?.id || reference.productId !== savedProduct.id)
        throw new TypeError('content_authoring_reference_invalid');
} const scope = variant.id ?? `draft-${i}`; add('title', variant.title, 'current_draft', undefined, scope); attributes(variant.attributes, scope); measurements(variant.measurements, scope); }); const source = { snapshot, facts }; if (Buffer.byteLength(canonicalContentAuthoringValue(source), 'utf8') > 32768)
    throw new TypeError('content_authoring_input_too_large'); return { title: snapshot.title, facts, sourceFingerprint: digest(source) }; }
