import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditContentSeoPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "seo_content_entry", permission: "integrations.manage", recordId, returnTo: "/seo/content" }); }
