import {AccountingNavigation} from "@/components/accounting/AccountingNavigation";
import {isMerchantActionAllowed} from "@celebix/saas-contracts";
import {MerchantModuleConsole} from "@/components/merchant-admin/MerchantModuleConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function AccountingSettingsPage(){const{tenantContext}=await requireServerPanelAccess();return <>{isMerchantActionAllowed(tenantContext.membership.role,"accounting.read")?<AccountingNavigation active="settings"/>:null}<MerchantModuleConsole kind="accounting_profile" canManage={isMerchantActionAllowed(tenantContext.membership.role,"integrations.manage")}/></>;}
