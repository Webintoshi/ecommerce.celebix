import {googleMarketingHandlers} from "@/lib/google-marketing-http/default";
export const dynamic="force-dynamic";
export function POST(request:Request){return googleMarketingHandlers.post(request,"apply");}
