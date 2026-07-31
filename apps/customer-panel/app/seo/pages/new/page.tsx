import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewPageSeoPage() { return renderMerchantRecordPage({ kind: "seo_page_entry", permission: "integrations.manage", returnTo: "/seo/pages" }); }
