import {runAdminLoginSecurityRoute} from "../../../../lib/admin-login-security/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request){return runAdminLoginSecurityRoute("forget",request);}
