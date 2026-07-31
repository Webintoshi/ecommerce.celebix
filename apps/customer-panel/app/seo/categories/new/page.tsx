import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewCategorySeoPage() { return renderMerchantRecordPage({ kind: "seo_category_entry", permission: "integrations.manage", returnTo: "/seo/categories" }); }
