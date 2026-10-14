import {googleMerchantHandlers} from '@/lib/google-merchant-http/default';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{variantId:string}>}){return googleMerchantHandlers.post(request,'preferences',(await params).variantId);}
