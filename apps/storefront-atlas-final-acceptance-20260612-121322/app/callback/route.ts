import { NextRequest, NextResponse } from "next/server";
import { getSafeInternalPath } from "@/lib/customer-auth-runtime";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/giris?error=auth_callback", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeInternalPath(request.cookies.get("celebix-customer-logto-next")?.value, "/hesap");

  if (!code || code === "fake") {
    return NextResponse.redirect(new URL("/giris?error=invalid_callback", request.url));
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
