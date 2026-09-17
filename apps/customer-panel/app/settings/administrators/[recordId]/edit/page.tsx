import { StoreAdminInvitationSource } from "@/components/store-admin-invitations/StoreAdminInvitationSource";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function EditAdministratorInvitePage({ params }: { params: Promise<{ recordId: string }> }) {
  const [{ recordId }, { tenantContext }] = await Promise.all([params, requireServerPanelAccess()]);
  return <StoreAdminInvitationSource recordId={recordId} canManage={tenantContext.membership.role === "store_owner"} />;
}
