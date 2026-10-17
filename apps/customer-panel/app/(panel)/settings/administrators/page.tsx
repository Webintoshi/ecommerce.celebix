import {hasCommercialCapability} from '@celebix/saas-contracts';
import {MerchantStaffConsole} from '../../../../components/settings/MerchantStaffConsole.tsx';
import {requireServerPanelAccess} from '../../../../lib/server-access.ts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function SettingsAdministratorsPage(){
 const access=await requireServerPanelAccess();
 if(access.support||access.tenantContext.membership.role!=='store_owner')return <p role="status">Personel yönetimini yalnızca mağaza sahibi yapabilir.</p>;
 return <MerchantStaffConsole cashierAvailable={hasCommercialCapability(access.tenantContext.entitlements, "cashier")}/>;
}
