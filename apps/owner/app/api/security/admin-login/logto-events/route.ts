import {resolveDefaultOwnerStagingAuthRouteSet} from '../../../../../lib/self-serve-auth-route-runtime/default.ts';
export const runtime='nodejs';
export async function POST(request:Request){const routes=await resolveDefaultOwnerStagingAuthRouteSet();return routes.adminLoginWebhook?.(request)??Response.json({code:'admin_login_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
