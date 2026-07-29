import { CatalogExtraPreview } from "@/components/catalog-admin/CatalogExtraPreview";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ExtraPreviewPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  await requireServerPanelAccess();
  return <CatalogExtraPreview resourceId={resourceId} />;
}
