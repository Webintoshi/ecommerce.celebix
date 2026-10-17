import {nativeMarketingHandlers} from '@/lib/native-marketing-http/default';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){return nativeMarketingHandlers.post(request,'preview');}
