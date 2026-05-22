import { NextResponse } from "next/server";
import LogtoServerClient from "@logto/next/server-actions";
import { getLogtoAdminConfig } from "@/app/logto";
import { clearAdminRoleCookie } from "@/lib/admin-role-cookie";
import { shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!shouldUseLogtoAdminAuth()) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const client = new LogtoServerClient(config);
  const url = await client.handleSignOut(`${config.baseUrl}/admin/login`);
  const response = NextResponse.redirect(url);
  clearAdminRoleCookie(response);
  return response;
}
