import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewCodeIntegrationPage() { return renderMerchantRecordPage({ kind: "code_integration", permission: "integrations.manage", returnTo: "/seo/code-integrations" }); }
