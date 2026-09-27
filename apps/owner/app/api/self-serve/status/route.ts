import {getDefaultOwnerSelfServeAuthRouteSet} from "../../../../lib/self-serve-auth-route-mount/route-set.ts";
export async function GET(request:Request) {return getDefaultOwnerSelfServeAuthRouteSet().publicStatus!(request);}
export async function POST(request:Request) {return getDefaultOwnerSelfServeAuthRouteSet().publicStatus!(request);}
