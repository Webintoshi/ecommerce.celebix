import {PhoneSecurityConsole} from '../../../components/settings/PhoneSecurityConsole.tsx';
import {requireServerPanelAccess} from '../../../lib/server-access.ts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function PersonalPhoneSecuritySettingsPage(){
 const access=await requireServerPanelAccess();
 if(access.support)return <p role="status">Destek oturumunda kişisel giriş telefonu yönetilemez.</p>;
 return <PhoneSecurityConsole/>;
}
