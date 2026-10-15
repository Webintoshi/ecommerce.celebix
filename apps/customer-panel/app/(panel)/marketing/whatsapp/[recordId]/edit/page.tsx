import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditWhatsappCampaignPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "whatsapp_campaign", permission: "marketing.manage", recordId, returnTo: "/marketing/whatsapp" }); }
