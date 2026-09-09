import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { BRAND_ID, MODEL } from "../../../../mira-catalog/catalog-fixture";

export default async function BrandEditorFixturePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  return <PanelLayoutClient model={MODEL}><CatalogResourceEditor kind="brand" resourceId={resourceId === "fixture" ? BRAND_ID : resourceId} canManage /></PanelLayoutClient>;
}
