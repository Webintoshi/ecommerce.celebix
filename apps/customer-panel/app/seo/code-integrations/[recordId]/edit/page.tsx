import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditCodeIntegrationPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "code_integration", permission: "integrations.manage", recordId, returnTo: "/seo/code-integrations" }); }
