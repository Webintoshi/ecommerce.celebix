import {emailMarketingHandlers} from "@/lib/email-marketing-http/default";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export function GET(request:Request){return emailMarketingHandlers.get(request,"lists");}
