import { NextResponse, type NextRequest } from "next/server";
import { hasExpectedInternalApiToken } from "@celebix/platform-config/src/http-security";

function readExpectedInternalApiToken(): string {
  return process.env.CELEBIX_INTERNAL_API_TOKEN?.trim() || process.env.STORE_INTERNAL_API_TOKEN?.trim() || "";
}

export function isInternalApiRequest(request: Pick<NextRequest, "headers">): boolean {
  const expectedToken = readExpectedInternalApiToken();
  return hasExpectedInternalApiToken(request, expectedToken);
}

export function requireInternalApiAccess(
  request: Pick<NextRequest, "headers">,
  errorMessage = "Bu endpoint yalnizca ic otomasyon icin kullanilabilir.",
): NextResponse | null {
  if (isInternalApiRequest(request)) {
    return null;
  }

  return NextResponse.json({ success: false, error: errorMessage }, { status: 403 });
}
