import {AccountingNavigation} from "@/components/accounting/AccountingNavigation";
import {isMerchantActionAllowed} from "@celebix/saas-contracts";
import {MerchantModuleConsole} from "@/components/merchant-admin/MerchantModuleConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function AccountingSettingsPage(){const{tenantContext,accountingAccess}=await requireServerPanelAccess();return <>{(isMerchantActionAllowed(tenantContext.membership.role,"accounting.read")||tenantContext.membership.role==="cashier"&&accountingAccess?.canManageAccounting===true)?<AccountingNavigation active="settings"/>:null}<MerchantModuleConsole kind="accounting_profile" canManage={(isMerchantActionAllowed(tenantContext.membership.role,"integrations.manage")||tenantContext.membership.role==="cashier"&&accountingAccess?.canManageAccounting===true)}/></>;}
