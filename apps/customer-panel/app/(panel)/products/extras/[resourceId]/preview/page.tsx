import { CatalogExtraPreviewRouter } from "@/components/catalog-admin/extras/CatalogExtraPreviewRouter";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ExtraPreviewPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  await requireServerPanelAccess();
  return <CatalogExtraPreviewRouter resourceId={resourceId} />;
}
