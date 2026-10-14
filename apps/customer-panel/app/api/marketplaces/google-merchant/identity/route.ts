import {googleMerchantHandlers} from '@/lib/google-merchant-http/default';
export const dynamic='force-dynamic';
export function POST(request:Request){return googleMerchantHandlers.post(request,'identity');}
