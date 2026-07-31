import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewIndexingRequestPage() { return renderMerchantRecordPage({ kind: "indexing_request", permission: "integrations.manage", returnTo: "/seo/fast-indexing" }); }
