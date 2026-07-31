import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewMarketplaceConnectionPage() { return renderMerchantRecordPage({ kind: "marketplace_connection", permission: "integrations.manage", returnTo: "/marketplaces" }); }
