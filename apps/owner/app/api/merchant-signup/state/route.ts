import {resolveDefaultOwnerStagingAuthRouteSet} from '../../../../lib/self-serve-auth-route-runtime/default.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){const routes=await resolveDefaultOwnerStagingAuthRouteSet();return routes.merchantSignupState?.(request)??Response.json({code:'unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
