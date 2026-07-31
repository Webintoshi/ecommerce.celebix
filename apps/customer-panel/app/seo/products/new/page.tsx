import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewProductSeoPage() { return renderMerchantRecordPage({ kind: "seo_product_entry", permission: "integrations.manage", returnTo: "/seo/products" }); }
