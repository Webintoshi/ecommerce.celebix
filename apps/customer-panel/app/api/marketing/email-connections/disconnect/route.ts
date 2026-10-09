import {emailMarketingHandlers} from "@/lib/email-marketing-http/default";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export function POST(request:Request){return emailMarketingHandlers.post(request,"disconnect");}
