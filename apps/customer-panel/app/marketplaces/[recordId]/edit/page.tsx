import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditMarketplaceConnectionPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "marketplace_connection", permission: "integrations.manage", recordId, returnTo: "/marketplaces" }); }
