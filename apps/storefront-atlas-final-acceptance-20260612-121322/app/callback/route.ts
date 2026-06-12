import { NextRequest, NextResponse } from "next/server";
import { getSafeInternalPath } from "@/lib/customer-auth-runtime";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function buildPublicUrl(pathname: string) {
  return new URL(pathname, STOREFRONT_RUNTIME.siteUrl);
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(buildPublicUrl("/giris?error=auth_callback"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeInternalPath(request.cookies.get("celebix-customer-logto-next")?.value, "/hesap");

  if (!code || code === "fake") {
    return NextResponse.redirect(buildPublicUrl("/giris?error=invalid_callback"));
  }

  return NextResponse.redirect(buildPublicUrl(nextPath));
}
