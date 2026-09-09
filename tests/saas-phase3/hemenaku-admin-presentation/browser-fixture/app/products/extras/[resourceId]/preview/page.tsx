import { CatalogExtraPreview } from "@/components/catalog-admin/CatalogExtraPreview";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { EXTRA_ID, MODEL } from "../../../../mira-catalog/catalog-fixture";

export default async function ExtraPreviewFixturePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  return <PanelLayoutClient model={MODEL}><CatalogExtraPreview resourceId={resourceId === "fixture" ? EXTRA_ID : resourceId} /></PanelLayoutClient>;
}
