import {cookies,headers} from "next/headers";
import {redirect} from "next/navigation";
import {AdminWhatsAppVerification} from "../../../components/auth/AdminWhatsAppVerification.tsx";
import {adminLoginRestartPath} from "../../../lib/admin-login-security/handler.ts";
import {resolveAdminLoginSecurityConfig} from "../../../lib/admin-login-security/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function AdminWhatsAppPage(){
 let config;try{config=resolveAdminLoginSecurityConfig(process.env);}catch{config=null;}
 if(!config)return <main><h1>Güvenli giriş</h1><p>Giriş doğrulaması şu anda kullanılamıyor. Tekrar deneyin.</p></main>;
 const requestHeaders=await headers();
 const hostname=requestHeaders.get("host");
 if(hostname?.includes(".")&&hostname!==new URL(config.authority.panelOrigin).host)redirect(`${config.authority.panelOrigin}/auth/whatsapp`);
 const destination=(await cookies()).get("__Host-celebix_admin_destination")?.value;
 return <AdminWhatsAppVerification restartUrl={adminLoginRestartPath(destination)}/>;
}
