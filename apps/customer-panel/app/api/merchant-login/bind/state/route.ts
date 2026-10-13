import {runMerchantPhoneRoute} from "../../../../../lib/merchant-phone/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request){return runMerchantPhoneRoute("bindState",request);}
