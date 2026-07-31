import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewInternalLinkPage() { return renderMerchantRecordPage({ kind: "seo_internal_link", permission: "integrations.manage", returnTo: "/seo/internal-linking" }); }
