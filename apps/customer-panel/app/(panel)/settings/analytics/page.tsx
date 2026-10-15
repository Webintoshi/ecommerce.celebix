import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";
import { AnalyticsSettingsConsole } from "@/components/analytics/AnalyticsSettingsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function AnalyticsSettingsPage(){const{tenantContext}=await requireServerPanelAccess();if(!isMerchantActionAllowed(tenantContext.membership.role,"configuration.manage"))redirect("/unauthorized");return <AnalyticsSettingsConsole/>}
