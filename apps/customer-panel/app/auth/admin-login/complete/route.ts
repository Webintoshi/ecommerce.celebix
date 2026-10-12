import {runAdminLoginSecurityRoute} from "../../../../lib/admin-login-security/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request){return runAdminLoginSecurityRoute("complete",request);}
