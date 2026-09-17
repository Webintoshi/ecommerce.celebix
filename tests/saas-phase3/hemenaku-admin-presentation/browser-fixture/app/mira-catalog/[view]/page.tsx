import { CatalogExtraPreview } from "@/components/catalog-admin/CatalogExtraPreview";
import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { ProductReviewConsole } from "@/components/catalog-admin/ProductReviewConsole";
import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";
import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";
import { ProductListConsole } from "@/components/catalog/ProductListConsole";
import { CategoryManager } from "@/components/catalog-onboarding/CategoryManager";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";

import { BRAND_ID, EXTRA_ID, MODEL, PRODUCT_ID } from "../catalog-fixture";

const RESOURCE_VIEWS = Object.freeze({
  collections: "collection",
  brands: "brand",
  attributes: "attribute",
  extras: "extra",
  definitions: "definition",
  tags: "tag",
} as const);

export default async function MiraCatalogFixture({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  let page;
  if (view === "list") page = <ProductListConsole canManage canArchive canImport />;
  else if (view === "detail") page = <ProductDetailConsole productId={PRODUCT_ID} canManage canArchive />;
  else if (view === "new") page = <ProductCreateForm initialMode="advanced" />;
  else if (view === "categories") page = <CategoryManager />;
  else if (view === "brand-edit") page = <CatalogResourceEditor kind="brand" resourceId={BRAND_ID} canManage />;
  else if (view === "extra-preview") page = <CatalogExtraPreview resourceId={EXTRA_ID} />;
  else if (view === "reviews") page = <ProductReviewConsole canModerate />;
  else {
    const kind = RESOURCE_VIEWS[view as keyof typeof RESOURCE_VIEWS] ?? "collection";
    page = <CatalogResourceConsole kind={kind} canManage />;
  }
  return <PanelLayoutClient model={MODEL}><div data-evidence="isolated-catalog-fixture">{page}</div></PanelLayoutClient>;
}
