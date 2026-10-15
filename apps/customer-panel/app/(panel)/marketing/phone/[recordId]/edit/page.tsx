import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditPhoneCampaignPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "phone_campaign", permission: "marketing.manage", recordId, returnTo: "/marketing/phone" }); }
