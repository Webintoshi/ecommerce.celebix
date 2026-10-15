import { OrderDraftEditor } from "@/components/orders/OrderDraftEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderDraftDetailPage({ params }: { params: Promise<{ draftId: string }> }) {
  const [{ draftId }, access] = await Promise.all([params, requireServerPanelAccess()]);
  return (
    <>
      <OrderDraftEditor draftId={draftId} canManage={false} legacyReadOnly />
    </>
  );
}
