import type { PublicStarterNavigationItem, StarterThemeComposition, StorefrontDesignEditorWorkspace } from "@celebix/saas-contracts";
import { normalizeStarterThemeCompositionV4 } from "@celebix/saas-contracts";
import { previewProductSourceKey, storefrontDesignPreviewDependencyKey, type StorefrontDesignPreviewResources } from "../../../../../../apps/customer-panel/lib/storefront-design-preview-model";
import { parseStorefrontDesignPreviewResources } from "../../../../../../apps/customer-panel/lib/storefront-design-preview-ui/client";
import { fixtureAssets, fixtureCategoryIds, fixtureCategoryParents, fixtureProducts } from "./catalog-fixture";

// Test-only catalog projection. The production composer, parser, editors and
// workspace lifecycle stay real; SQL projection is verified by its own harness.
export async function designFixturePreviewResources(workspace: StorefrontDesignEditorWorkspace, composition: StarterThemeComposition = workspace.design.composition, previewProductId?: string): Promise<StorefrontDesignPreviewResources> {
  const dependencyKey = storefrontDesignPreviewDependencyKey(composition, previewProductId);
  const normalized = normalizeStarterThemeCompositionV4(composition);
  const sections = normalized.sections;
  const product = fixtureProducts.find(({ id }) => id === previewProductId) ?? fixtureProducts[0];
  const card = ({ id, slug, title, currency, priceCents, available, media, brand }: typeof product) => ({ id, slug, title, currency, priceCents, available, media: media.map(({ url, altText, width, height }) => ({ url, altText, width, height })), ...(brand ? { brand: { name: brand.name } } : {}) });
  const sourceKeys = new Set<string>();
  const productSources = sections.flatMap((section) => {
    if (!section.enabled || section.kind !== "product_row") return [];
    const key = previewProductSourceKey(section);
    if (sourceKeys.has(key)) return [];
    sourceKeys.add(key);
    const items = section.source === "manual" ? (section.productIds ?? []).flatMap((id) => fixtureProducts.filter((item) => item.id === id))
      : section.source === "category" ? fixtureProducts.filter((item) => item.primaryCategoryId === section.categoryId) : fixtureProducts;
    return [{ key, status: items.length ? "ready" : "empty", items: items.map(card) }];
  });
  const categories = sections.flatMap((section) => section.enabled && section.kind === "category_grid" ? section.categoryIds : []);
  const selectedFeatured = fixtureAssets.find(({ id }) => id === normalized.navigation.featuredAssetId);
  // Synthetic hierarchy covers children and grandchildren without changing any
  // saved fixture identifiers or the default design composition.
  const navigationItem = (id: string, depth = 0): PublicStarterNavigationItem | undefined => {
    const destination = workspace.destinations.find((item) => item.kind === "collection" && item.resourceId === id);
    const slug = destination?.path.match(/^\/categories\/([a-z0-9-]+)$/)?.[1]; if (!destination || !slug) return undefined;
    return { name: destination.label, slug, children: depth < 2 ? [...fixtureCategoryParents].filter(([, parentId]) => parentId === id).flatMap(([childId]) => { const item = navigationItem(childId, depth + 1); return item ? [item] : []; }) : [], ...(id === normalized.navigation.featuredCategoryId && selectedFeatured ? { featured: { name: destination.label, slug, image: { url: selectedFeatured.url, altText: selectedFeatured.altText, mediaType: selectedFeatured.mediaType, width: selectedFeatured.width, height: selectedFeatured.height } } } : {}) };
  };
  const navigation = { status: "ready", value: { items: normalized.navigation.rootCategoryIds.flatMap((id) => { const item = navigationItem(id); return item ? [item] : []; }) } };
  return parseStorefrontDesignPreviewResources({ schemaVersion: 1, dependencyKey, productSources,
    navigation,
    productDetail: { status: "ready", value: product }, relatedProducts: fixtureProducts.filter(({ id }) => id !== product.id).map(card), testimonials: { status: "ready", items: product.reviews },
    assets: fixtureAssets.map((asset) => ({ id: asset.id, status: "ready", image: { url: asset.url, altText: asset.altText, mediaType: asset.mediaType, width: asset.width, height: asset.height } })), hotspots: [],
    media: workspace.media.filter(option=>option.reference.kind==="media").map(option=>({id:option.id,status:"ready",image:{url:option.url,altText:option.altText,mediaType:option.mediaType,width:option.width,height:option.height}})),
    categorySections: sections.flatMap(section=>section.enabled&&section.kind==="category_grid"?[{sectionId:section.sectionId,status:section.categoryIds.length?"ready":"empty",...(section.categoryIds.length?{value:{heading:section.heading,layout:section.layout,items:section.categoryIds.map(id=>{const reference=section.categoryImages?.find(item=>item.categoryId===id);const image=fixtureAssets.find(item=>item.id===reference?.assetId)??fixtureAssets[1];return {id,slug:`kategori-${fixtureCategoryIds.indexOf(id)+1}`,name:workspace.destinations.find(item=>item.resourceId===id)?.label??"QA Kategori",image:{url:image.url,mediaType:image.mediaType,altText:image.altText,width:image.width,height:image.height}};})}}:{} )}]:[]),
    categoryShowcase: {status:"empty"},
  }, dependencyKey);
}
