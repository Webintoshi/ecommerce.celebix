import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { clearAdminRoleCookie, writeAdminRoleCookie } from "@/lib/admin-role-cookie";
import {
  getLogtoAdminConfig,
  getLogtoAdminConfigStatus,
} from "@/app/logto";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
  handleLogtoAdminCallback,
  isKnownLogtoAdminRole,
  resolveLogtoAdminUser,
  resolveLogtoStoreRole,
  shouldUseLogtoAdminAuth,
} from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

function buildPublicAdminUrl(path: string): URL {
  return new URL(path, `${STORE_RUNTIME.adminUrl.replace(/\/$/, "")}/`);
}

export async function GET(request: NextRequest) {
  if (!shouldUseLogtoAdminAuth()) {
    return NextResponse.redirect(buildPublicAdminUrl("/admin/login"));
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    const status = getLogtoAdminConfigStatus();
    const redirectUrl = buildPublicAdminUrl("/admin/login");
    redirectUrl.searchParams.set("error", status.missingEnv.length > 0 ? "logto_not_configured" : "logto_disabled");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const { identity, postRedirectUri } = await handleLogtoAdminCallback(request);

    if (!identity) {
      const response = NextResponse.redirect(buildPublicAdminUrl("/admin/login?error=logto_session_missing"));
      clearAdminRoleCookie(response);
      return response;
    }

    const bridgeUser = await resolveLogtoAdminUser(identity);
    const roleRow = bridgeUser
      ? await resolveLogtoStoreRole(bridgeUser.id)
      : null;

    if (!bridgeUser?.is_active || !roleRow?.is_active || !isKnownLogtoAdminRole(roleRow.role)) {
      const response = NextResponse.redirect(buildPublicAdminUrl("/admin/login?error=logto_admin_bridge_missing"));
      clearAdminRoleCookie(response);
      return response;
    }

    const redirectPath = sanitizeInternalRedirectPath(postRedirectUri ?? "/admin", "/admin");
    const response = NextResponse.redirect(buildPublicAdminUrl(redirectPath));
    writeAdminRoleCookie(response, {
      userId: bridgeUser.id,
      role: roleRow.role,
      provider: "logto",
      providerSubject: identity.subject,
    });
    return response;
  } catch (error) {
    console.error("Logto admin callback skeleton error:", error);
    return NextResponse.redirect(buildPublicAdminUrl("/admin/login?error=logto_callback_failed"));
  }
}
