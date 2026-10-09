import {emailMarketingBrevoWebhook} from "@/lib/email-marketing-http/default";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{connectionId:string}>}){return emailMarketingBrevoWebhook(request,(await context.params).connectionId);}
