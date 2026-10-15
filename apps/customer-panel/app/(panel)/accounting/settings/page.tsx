import Link from "next/link";
import styles from "@/components/accounting/accounting.module.css";
import {isMerchantActionAllowed} from "@celebix/saas-contracts";
import {MerchantModuleConsole} from "@/components/merchant-admin/MerchantModuleConsole";
import {requireServerPanelAccess} from "@/lib/server-access";
export default async function AccountingSettingsPage(){const{tenantContext}=await requireServerPanelAccess();return <>{isMerchantActionAllowed(tenantContext.membership.role,"accounting.read")?<nav className={styles.tabs} aria-label="Muhasebe bölümleri"><Link href="/accounting">Muhasebe</Link><Link href="/accounting/receivables">Müşteri borçları</Link><Link href="/accounting/suppliers">Tedarikçi borçları</Link><Link href="/accounting/accounts">Kasa ve banka</Link><Link href="/accounting/cash-sessions">Kasa sayımı</Link><Link href="/accounting/expenses">Giderler</Link><Link href="/accounting/settings" aria-current="page">İşletme bilgileri</Link></nav>:null}<MerchantModuleConsole kind="accounting_profile" canManage={isMerchantActionAllowed(tenantContext.membership.role,"integrations.manage")}/></>;}
