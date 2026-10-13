import {resolveDefaultOwnerStagingAuthRouteSet} from '../../../../lib/self-serve-auth-route-runtime/default.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){const routes=await resolveDefaultOwnerStagingAuthRouteSet();return routes.internalMerchantWhatsApp?.(request)??Response.json({code:'merchant_whatsapp_unavailable'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});}
