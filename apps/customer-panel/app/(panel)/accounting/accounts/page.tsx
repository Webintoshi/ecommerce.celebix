import {AccountingConsole} from "@/components/accounting/AccountingConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function AccountingPage(){const {tenantContext,accountingAccess}=await requireServerPanelAccess();const role=tenantContext.membership.role;return <AccountingConsole mode="accounts" canManage={role==="store_owner"||role==="admin"||role==="cashier"&&accountingAccess?.canManageAccounting===true} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
