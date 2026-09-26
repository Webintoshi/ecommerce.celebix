// Named, local-only UI fixture. Does not connect to merchant or provider services.
import { parseCatalogOnboardingIntent, parseProductVariant } from '@celebix/saas-contracts';
import { EDITOR, PRODUCT, VARIANT } from '../mira-catalog/catalog-fixture';
export const MEASUREMENT_PRODUCT_ID = '92000000-0000-4000-8000-000000000002';
export const MEASUREMENT_VARIANT_ID = '92000000-0000-4000-8000-000000000003';
let product = { ...PRODUCT, id: MEASUREMENT_PRODUCT_ID, title: 'Cemo Ölçü QA', slug: 'cemo-olcu-qa', status: 'draft', version: 1 };
let variants: any[] = [{ ...VARIANT, productId: MEASUREMENT_PRODUCT_ID, id: MEASUREMENT_VARIANT_ID, measurements: { weight: { valueMilli: 14890, unit: 'g' } }, version: 1 }];
export function measurementDetail() { return { product, variants }; }
export function measurementEditor() { return { ...EDITOR, product, variants: variants.map(variant => ({ variant, continueSellingWhenOutOfStock: false, inventory: [] })) }; }
export function measurementCreate(raw: unknown) {
 const intent = parseCatalogOnboardingIntent(raw);
 if (!intent.title.startsWith('Cemo Ölçü QA')) return null;
 product = { ...product, title: intent.title, status: intent.publish ? 'active' : 'draft' };
 const source = intent.kind === 'quick' ? [{ title: 'Standart', sku: intent.sku, priceCents: intent.priceCents, stockTracking: true, stockQuantity: intent.stockQuantity ?? 0, attributes: {}, measurements: intent.measurements }] : intent.variants;
 variants = source.map((fields, index) => ({ ...VARIANT, ...Object.fromEntries(Object.entries(fields).filter(([key]) => ['title','sku','barcode','priceCents','compareAtCents','costCents','stockTracking','stockQuantity','attributes','measurements'].includes(key))), id: index ? `92000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}` : MEASUREMENT_VARIANT_ID, productId: product.id, version: 1, createdAt: product.createdAt, updatedAt: product.updatedAt, status: 'active' }));
 return { ...EDITOR, product, variants, mediaCount: 0, replayed: false };
}
export function measurementUpdate(variantId: string, raw: unknown) {
 const fields = raw as { expectedVersion: number; variant: Record<string, unknown> };
 const index = variants.findIndex(variant => variant.id === variantId);
 if (index < 0) return null;
 if (fields.expectedVersion !== variants[index].version) return null;
 const { expectedVersion } = fields;
 const { measurements, ...values } = fields.variant;
 const next = { ...variants[index], ...values, version: expectedVersion + 1 };
 if (measurements === null) delete next.measurements;
 else if (measurements !== undefined) next.measurements = measurements;
 const parsed = parseProductVariant(next);
 variants = variants.map((variant, position) => position === index ? parsed : variant);
 return { variant: parsed, replayed: false };
}
