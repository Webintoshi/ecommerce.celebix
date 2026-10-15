import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewInvoiceIntegrationPage() { return renderMerchantRecordPage({ kind: "invoice_integration", permission: "integrations.manage", returnTo: "/accounting/invoicing-integration" }); }
