import {ownerPublicOrigin} from '@/lib/platform/origin';
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createOwnerServerClient } from "@/lib/owner-supabase-server";
import { getMissingOwnerSupabaseEnvNames } from "@/lib/owner-supabase-shared";
import {sanitizeInternalRedirectPath} from '@celebix/platform-config/src/http-security';

interface ConfirmRouteProps {
  request: Request;
}

export async function GET(request: Request, _context: ConfirmRouteProps) {
  const requestUrl = new URL(request.url);
  const publicOrigin = ownerPublicOrigin(request);
  if (!publicOrigin) return NextResponse.json({error:"Giriş adresi doğrulanamadı."},{status:503});
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeInternalRedirectPath(requestUrl.searchParams.get("next"), '/security');

  if (getMissingOwnerSupabaseEnvNames().length > 0) {
    return NextResponse.redirect(new URL(`/login?error=owner_auth_env_missing`, publicOrigin));
  }

  if (!tokenHash || !type || !['signup','invite','recovery','email'].includes(type)) {
    return NextResponse.redirect(new URL(`/login?error=missing_confirmation_token`, publicOrigin));
  }

  const supabase = await createOwnerServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=confirmation_failed`, publicOrigin));
  }

  return NextResponse.redirect(new URL(next, publicOrigin));
}
