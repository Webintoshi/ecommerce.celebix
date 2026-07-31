import { renderMerchantRecordPage } from "@/components/merchant-admin/render-merchant-record-page";
export default function NewAdministratorInvitePage() { return renderMerchantRecordPage({ kind: "administrator_invite", permission: "configuration.manage", returnTo: "/settings/administrators" }); }
