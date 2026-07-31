import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewContentSeoPage() { return renderMerchantRecordPage({ kind: "seo_content_entry", permission: "integrations.manage", returnTo: "/seo/content" }); }
