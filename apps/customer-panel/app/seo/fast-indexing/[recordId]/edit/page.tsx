import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditIndexingRequestPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "indexing_request", permission: "integrations.manage", recordId, returnTo: "/seo/fast-indexing" }); }
