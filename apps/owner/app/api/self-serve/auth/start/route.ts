import { NextResponse } from "next/server";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { buildSelfServeLogtoStartUrl, buildSelfServeOwnerPublicUrl } from "@/lib/self-serve-logto";

export async function GET(request: Request) {
  if(process.env.CELEBIX_MERCHANT_WHATSAPP_ENABLED==='true')return new Response(null,{status:303,headers:{location:'/kayit','cache-control':'no-store','referrer-policy':'no-referrer'}});
  const flags = getSelfServeFeatureFlags();
  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("returnTo") ?? "/kayit";

  if (!flags.signupEnabled) {
    const disabledUrl = buildSelfServeOwnerPublicUrl(request, "/kayit");
    disabledUrl.searchParams.set("signup", "disabled");
    return NextResponse.redirect(disabledUrl);
  }

  const { url } = buildSelfServeLogtoStartUrl(request, returnTo);
  return NextResponse.redirect(url);
}
