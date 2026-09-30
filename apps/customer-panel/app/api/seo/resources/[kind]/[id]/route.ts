import { seoHandlers } from "@/lib/seo-http/default";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,context:{params:Promise<{kind:string;id:string}>}){const {kind,id}=await context.params;return seoHandlers.saveResource(request,kind,id);}
