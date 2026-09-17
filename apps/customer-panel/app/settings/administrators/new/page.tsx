import { StoreAdminInvitationSource } from "@/components/store-admin-invitations/StoreAdminInvitationSource";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function NewAdministratorInvitePage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <StoreAdminInvitationSource canManage={tenantContext.membership.role === "store_owner"} />;
}
