import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditEmailCampaignPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "email_campaign", permission: "marketing.manage", recordId, returnTo: "/marketing/email" }); }
