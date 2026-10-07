import {googleMarketingHandlers} from "@/lib/google-marketing-http/default";
export const dynamic="force-dynamic";
export function GET(request:Request){return googleMarketingHandlers.get(request,"overview");}
