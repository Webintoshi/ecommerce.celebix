import { seoHandlers } from "@/lib/seo-http/default";
export const dynamic="force-dynamic";
export function POST(request:Request){return seoHandlers.save(request,"checks");}
