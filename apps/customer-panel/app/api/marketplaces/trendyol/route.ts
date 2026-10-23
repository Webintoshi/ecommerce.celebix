import {trendyolHandlers} from '@/lib/trendyol-http/default';
export const runtime='nodejs';
export function GET(request:Request){return trendyolHandlers.get(request,'overview');}
