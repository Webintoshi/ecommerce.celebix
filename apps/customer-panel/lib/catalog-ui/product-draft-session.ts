export type ProductDraftMedia = Readonly<{
  file: File;
  altText: string;
  preview: string;
}>;

export type ProductDraftVariant = Readonly<{
  title: string;
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  cost: string;
  stockQuantity: string;
  continueSellingWhenOutOfStock: boolean;
  shippingDesi: string;
  hsCode: string;
  attributes: Readonly<Record<string, string>>;
}>;

export type ProductDraft = Readonly<{
  kind: "simple" | "variant";
  productType: "physical" | "digital";
  title: string;
  description: string;
  variants: readonly ProductDraftVariant[];
  standardVariant?: ProductDraftVariant;
  categoryIds: readonly string[];
  brandId: string;
  collectionIds: readonly string[];
  tagIds: readonly string[];
  supplierName: string;
  minimumOrderQuantity: string;
  maximumOrderQuantity: string;
  googleProductCategoryId: string;
  seoTitle: string;
  seoDescription: string;
  channelIds: readonly string[];
  channelSelectionTouched?: boolean;
  resourceAttributeIds: readonly string[];
  resourceExtraIds: readonly string[];
  resourceDefinitionIds: readonly string[];
  media: readonly ProductDraftMedia[];
}>;

export type ProductDraftSession = Readonly<{
  initial: ProductDraft;
  current: ProductDraft;
}>;

type ProductDraftPatch = Partial<{
  [Key in keyof ProductDraft]: ProductDraft[Key];
}>;

type QuickProductDraft = Readonly<{
  title: string;
  sku: string;
  barcode?: string;
  price: string;
  stockQuantity: string;
  categoryId: string;
  media: readonly ProductDraftMedia[];
}>;

const EMPTY_VARIANT: ProductDraftVariant = {
  title: "Varsayılan",
  sku: "",
  barcode: "",
  price: "",
  compareAt: "",
  cost: "",
  stockQuantity: "",
  continueSellingWhenOutOfStock: false,
  shippingDesi: "",
  hsCode: "",
  attributes: {},
};

const EMPTY_DRAFT: ProductDraft = {
  kind: "simple",
  productType: "physical",
  title: "",
  description: "",
  variants: [EMPTY_VARIANT],
  categoryIds: [],
  brandId: "",
  collectionIds: [],
  tagIds: [],
  supplierName: "",
  minimumOrderQuantity: "",
  maximumOrderQuantity: "",
  googleProductCategoryId: "",
  seoTitle: "",
  seoDescription: "",
  channelIds: [],
  resourceAttributeIds: [],
  resourceExtraIds: [],
  resourceDefinitionIds: [],
  media: [],
};

function freezeDraft(draft: ProductDraft): ProductDraft {
  const freezeVariant = (variant: ProductDraftVariant) => Object.freeze({
    ...variant,
    attributes: Object.freeze({ ...variant.attributes }),
  });
  const variants = draft.variants.map(freezeVariant);
  const { standardVariant, channelSelectionTouched, ...fields } = draft;
  const media = draft.media.map((item) => Object.freeze({ ...item }));

  return Object.freeze({
    ...fields,
    variants: Object.freeze(variants),
    ...(standardVariant === undefined ? {} : { standardVariant: freezeVariant(standardVariant) }),
    ...(channelSelectionTouched ? { channelSelectionTouched: true } : {}),
    categoryIds: Object.freeze([...draft.categoryIds]),
    collectionIds: Object.freeze([...draft.collectionIds]),
    tagIds: Object.freeze([...draft.tagIds]),
    channelIds: Object.freeze([...draft.channelIds]),
    resourceAttributeIds: Object.freeze([...draft.resourceAttributeIds]),
    resourceExtraIds: Object.freeze([...draft.resourceExtraIds]),
    resourceDefinitionIds: Object.freeze([...draft.resourceDefinitionIds]),
    media: Object.freeze(media),
  });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (left instanceof File || right instanceof File) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => valuesEqual(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && valuesEqual(leftRecord[key], rightRecord[key]));
}

export function createEmptyProductDraftSession(): ProductDraftSession {
  const draft = freezeDraft(EMPTY_DRAFT);
  return Object.freeze({ initial: draft, current: draft });
}

export function updateProductDraft(
  session: ProductDraftSession,
  patch: ProductDraftPatch,
): ProductDraftSession {
  return Object.freeze({
    initial: session.initial,
    current: freezeDraft({ ...session.current, ...patch }),
  });
}

export function mergeQuickProductDraft(
  session: ProductDraftSession,
  quick: QuickProductDraft,
): ProductDraftSession {
  const firstVariant = session.current.variants[0] ?? EMPTY_VARIANT;
  const preserveVariantDraft = session.current.kind === "variant"
    || session.current.variants.length > 1
    || session.current.variants.some((variant) => Object.keys(variant.attributes).length > 0);
  return updateProductDraft(session, {
    title: quick.title,
    variants: preserveVariantDraft ? session.current.variants : [{
      ...firstVariant,
      sku: quick.sku,
      ...(quick.barcode === undefined ? {} : { barcode: quick.barcode }),
      price: quick.price,
      stockQuantity: quick.stockQuantity,
    }],
    categoryIds: session.current.categoryIds.length > 1
      ? session.current.categoryIds
      : quick.categoryId ? [quick.categoryId] : [],
    media: quick.media,
  });
}

/** Hidden detailed fields must never be discarded by a quick-only create intent. */
export function quickDraftRequiresDetailedSave(draft: ProductDraft, defaultStorefrontChannelIds?: readonly string[]): boolean {
  const channelSelectionDiffers = draft.channelIds.length > 0
    && (defaultStorefrontChannelIds === undefined
      || new Set(draft.channelIds).size !== new Set(defaultStorefrontChannelIds).size
      || draft.channelIds.some((id) => !defaultStorefrontChannelIds.includes(id)));
  return draft.kind === "variant"
    || draft.variants.length !== 1
    || draft.productType === "digital"
    || draft.categoryIds.length > 1
    || draft.channelSelectionTouched === true
    || channelSelectionDiffers
    || Boolean(draft.description.trim() || draft.brandId || draft.supplierName.trim()
      || draft.googleProductCategoryId.trim() || draft.seoTitle.trim() || draft.seoDescription.trim()
      || draft.maximumOrderQuantity.trim())
    || (draft.minimumOrderQuantity.trim() !== "" && draft.minimumOrderQuantity.trim() !== "1")
    || [draft.collectionIds, draft.tagIds, draft.resourceAttributeIds, draft.resourceExtraIds, draft.resourceDefinitionIds]
      .some((ids) => ids.length > 0)
    || draft.variants.some((variant) => Object.keys(variant.attributes).length > 0
      || Boolean(variant.compareAt.trim() || variant.cost.trim() || variant.shippingDesi.trim() || variant.hsCode.trim())
      || variant.continueSellingWhenOutOfStock);
}

export function commitProductDraft(session: ProductDraftSession): ProductDraftSession {
  return Object.freeze({ initial: session.current, current: session.current });
}

export function replaceProductDraft(
  _session: ProductDraftSession,
  replacement: ProductDraft,
): ProductDraftSession {
  const draft = freezeDraft(replacement);
  return Object.freeze({ initial: draft, current: draft });
}

export function productDraftIsDirty(session: ProductDraftSession): boolean {
  return !valuesEqual(session.initial, session.current);
}
