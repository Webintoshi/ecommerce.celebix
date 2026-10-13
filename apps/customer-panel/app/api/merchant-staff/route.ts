import {runMerchantPhoneRoute} from "../../../lib/merchant-phone/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request){return runMerchantPhoneRoute("staff",request);}
export async function POST(request:Request){return runMerchantPhoneRoute("staff",request);}
