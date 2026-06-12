import { NextRequest, NextResponse } from "next/server";
import { getLogtoCustomerRuntime } from "@/lib/customer-auth-runtime";

export async function GET(request: NextRequest) {
  const runtime = getLogtoCustomerRuntime();
  const redirectUrl = runtime.issuer
    ? new URL(`${runtime.issuer}/session/end`)
    : new URL(runtime.postLogoutRedirectUrl);

  if (runtime.issuer && runtime.clientId) {
    redirectUrl.searchParams.set("client_id", runtime.clientId);
    redirectUrl.searchParams.set("post_logout_redirect_uri", runtime.postLogoutRedirectUrl);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete("celebix-customer-logto-next");
  response.cookies.delete("celebix-customer-logto-session");

  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}
