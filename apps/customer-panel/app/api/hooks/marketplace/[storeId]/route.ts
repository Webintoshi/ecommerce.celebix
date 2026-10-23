import {trendyolHandlers} from '@/lib/trendyol-http/default';
export const runtime='nodejs';
export async function POST(request:Request,{params}:Readonly<{params:Promise<{storeId:string}>}>){return trendyolHandlers.webhook(request,(await params).storeId);}
