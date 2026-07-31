import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewEmailCampaignPage() { return renderMerchantRecordPage({ kind: "email_campaign", permission: "marketing.manage", returnTo: "/marketing/email" }); }
