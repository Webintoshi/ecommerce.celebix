import {AdminLoginSecurityConsole} from "../../../components/settings/AdminLoginSecurityConsole.tsx";
import {resolveAdminLoginSecurityConfig} from "../../../lib/admin-login-security/runtime.ts";
import {requireServerPanelAccess} from "../../../lib/server-access.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function AdminSecuritySettingsPage({searchParams}:Readonly<{searchParams?:Promise<Record<string,string|string[]|undefined>>}>){
 const access=await requireServerPanelAccess();
 if(access.support)return <p>Destek oturumunda kişisel giriş güvenliği yönetilemez.</p>;
 let config;try{config=resolveAdminLoginSecurityConfig(process.env);}catch{config=null;}
 if(!config)return <p>Giriş güvenliği şu anda kullanılamıyor. Tekrar deneyin.</p>;
 const message=(await searchParams)?.adminSecurity;
 const destinationHostname=access.tenantContext.resolvedHost?.hostname;
 const freshLogin=new URL("/auth/login",config.authority.panelOrigin);if(destinationHostname)freshLogin.searchParams.set("destination",destinationHostname);
 const freshLoginUrl=destinationHostname?freshLogin.href:undefined;
 const returnMessage=message==="device_unavailable"||message==="fresh_login_required"?message:undefined;
 return <AdminLoginSecurityConsole freshLoginUrl={freshLoginUrl} returnMessage={returnMessage} authorityOrigin={new URL(config.logto.endSessionEndpoint).origin} panelOrigin={config.authority.panelOrigin}/>;
}
