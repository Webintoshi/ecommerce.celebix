import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createOwnerServerClient } from "@/lib/owner-supabase-server";

interface ConfirmRouteProps {
  request: Request;
}

export async function GET(request: Request, _context: ConfirmRouteProps) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") || "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(`/login?error=missing_confirmation_token`, requestUrl.origin));
  }

  const supabase = await createOwnerServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=confirmation_failed`, requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
