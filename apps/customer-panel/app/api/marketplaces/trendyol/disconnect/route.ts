import {trendyolHandlers} from '@/lib/trendyol-http/default';
export const runtime='nodejs';
export function POST(request:Request){return trendyolHandlers.post(request,'disconnect');}
