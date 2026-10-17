import { getDefaultNativeMarketingUnsubscribeHandler } from "@/lib/native-marketing/webhook-default";
export const dynamic="force-dynamic";
export const runtime="nodejs";
async function handle(request:Request):Promise<Response>{
  try{const handler=await getDefaultNativeMarketingUnsubscribeHandler();return handler(request);}
  catch{return new Response(null,{status:503,headers:{"cache-control":"no-store","referrer-policy":"no-referrer"}});}
}
export const GET=handle;
export const POST=handle;
