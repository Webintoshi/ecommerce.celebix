import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewGeoSeoPage() { return renderMerchantRecordPage({ kind: "seo_geo_profile", permission: "integrations.manage", returnTo: "/seo/geo-optimization" }); }
