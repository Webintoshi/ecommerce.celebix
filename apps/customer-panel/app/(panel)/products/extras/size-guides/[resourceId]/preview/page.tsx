import { CatalogSizeGuidePreview } from "@/components/catalog-admin/extras/CatalogSizeGuidePreview";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SizeGuidePreviewPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  await requireServerPanelAccess();
  return <CatalogSizeGuidePreview resourceId={resourceId} />;
}
