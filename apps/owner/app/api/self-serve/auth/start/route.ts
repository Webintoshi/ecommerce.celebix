import { NextResponse } from "next/server";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { buildSelfServeLogtoStartUrl, buildSelfServeOwnerPublicUrl } from "@/lib/self-serve-logto";

export async function GET(request: Request) {
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
