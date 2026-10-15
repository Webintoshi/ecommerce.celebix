import {AccountingConsole} from "@/components/accounting/AccountingConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function AccountingPage(){const {tenantContext}=await requireServerPanelAccess();const role=tenantContext.membership.role;return <AccountingConsole mode="overview" canManage={role==="store_owner"||role==="admin"} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
