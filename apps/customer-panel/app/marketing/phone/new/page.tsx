import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewPhoneCampaignPage() { return renderMerchantRecordPage({ kind: "phone_campaign", permission: "marketing.manage", returnTo: "/marketing/phone" }); }
