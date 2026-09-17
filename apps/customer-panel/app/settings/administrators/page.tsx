import { StoreAdminInvitationsConsole } from "@/components/store-admin-invitations/StoreAdminInvitationsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function SettingsAdministratorsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <StoreAdminInvitationsConsole canManage={tenantContext.membership.role === "store_owner"} />;
}
