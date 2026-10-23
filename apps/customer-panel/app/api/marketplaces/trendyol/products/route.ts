import {trendyolHandlers} from '@/lib/trendyol-http/default';
export const runtime='nodejs';
export function GET(request:Request){return trendyolHandlers.get(request,'products');}
export function POST(request:Request){return trendyolHandlers.post(request,'products');}
