import {runMerchantPhoneRoute} from "../../../../lib/merchant-phone/runtime.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request,context:Readonly<{params:Promise<{staffId:string}>}>){return runMerchantPhoneRoute("staff",request,(await context.params).staffId);}
