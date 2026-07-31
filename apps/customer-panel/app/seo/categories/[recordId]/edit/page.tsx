import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditCategorySeoPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "seo_category_entry", permission: "integrations.manage", recordId, returnTo: "/seo/categories" }); }
