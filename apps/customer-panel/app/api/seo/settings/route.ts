import { seoHandlers } from "@/lib/seo-http/default";
export const dynamic="force-dynamic";
export function GET(request:Request){return seoHandlers.get(request,"settings");}
export function POST(request:Request){return seoHandlers.save(request,"settings");}
