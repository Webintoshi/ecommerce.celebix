import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewWhatsappCampaignPage() { return renderMerchantRecordPage({ kind: "whatsapp_campaign", permission: "marketing.manage", returnTo: "/marketing/whatsapp" }); }
