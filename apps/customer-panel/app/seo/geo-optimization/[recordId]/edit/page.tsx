import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default async function EditGeoSeoPage({ params }: { params: Promise<{ recordId: string }> }) { const { recordId } = await params; return renderMerchantRecordPage({ kind: "seo_geo_profile", permission: "integrations.manage", recordId, returnTo: "/seo/geo-optimization" }); }
