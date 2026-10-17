import {nativeMarketingHandlers} from '@/lib/native-marketing-http/default';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{campaignId:string}>}){return nativeMarketingHandlers.post(request,'cancel',(await context.params).campaignId);}
