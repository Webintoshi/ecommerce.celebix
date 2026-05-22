import { NextRequest, NextResponse } from "next/server";
import EdgeLogtoClient from "@logto/next/edge";
import { getLogtoAdminConfig } from "@/app/logto";
import { clearAdminRoleCookie } from "@/lib/admin-role-cookie";
import { readSetCookieHeaders, shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!shouldUseLogtoAdminAuth()) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const logtoResponse = await new EdgeLogtoClient(config).handleSignOut(`${config.baseUrl}/admin/login`)(request);
  const response = NextResponse.redirect(logtoResponse.headers.get("location") ?? `${config.baseUrl}/admin/login`);
  for (const value of readSetCookieHeaders(logtoResponse.headers)) {
    response.headers.append("set-cookie", value);
  }
  clearAdminRoleCookie(response);
  return response;
}
