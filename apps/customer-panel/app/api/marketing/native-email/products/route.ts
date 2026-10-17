import {nativeMarketingHandlers} from '@/lib/native-marketing-http/default';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){return nativeMarketingHandlers.get(request,'products');}
