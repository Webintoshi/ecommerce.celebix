import {CommissionConsole} from "@/components/accounting/CommissionConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function CommissionsPage(){const{tenantContext}=await requireServerPanelAccess(),role=tenantContext.membership.role;return <CommissionConsole canRead={role==="store_owner"||role==="admin"} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
