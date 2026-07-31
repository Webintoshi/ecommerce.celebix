import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditInternalLinkPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "seo_internal_link", permission: "integrations.manage", recordId, returnTo: "/seo/internal-linking" }); }
