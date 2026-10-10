import {luckyWheelHandlers} from '@/lib/lucky-wheel-http/default';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{campaignId:string}>}){return luckyWheelHandlers.history(request,(await params).campaignId)}
