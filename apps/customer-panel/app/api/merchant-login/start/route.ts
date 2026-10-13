import {runMerchantPhoneRoute} from "../../../../lib/merchant-phone/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request){return runMerchantPhoneRoute("start",request);}
