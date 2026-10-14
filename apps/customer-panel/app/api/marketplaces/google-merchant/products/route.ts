import {googleMerchantHandlers} from '@/lib/google-merchant-http/default';
export const dynamic='force-dynamic';
export function GET(request:Request){return googleMerchantHandlers.get(request,'products');}
