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
  const variants = draft.variants.map((variant) => Object.freeze({
    ...variant,
    attributes: Object.freeze({ ...variant.attributes }),
  }));
  const media = draft.media.map((item) => Object.freeze({ ...item }));

  return Object.freeze({
    ...draft,
    variants: Object.freeze(variants),
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
  return updateProductDraft(session, {
    title: quick.title,
    variants: [{
      ...firstVariant,
      price: quick.price,
      stockQuantity: quick.stockQuantity,
    }],
    categoryIds: quick.categoryId ? [quick.categoryId] : [],
    media: quick.media,
  });
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
