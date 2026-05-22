import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { signIn } from "@logto/next/server-actions";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { getLogtoAdminConfig } from "@/app/logto";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { LOGTO_ADMIN_CALLBACK_PATH, shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

function buildLoginRedirect(nextPath: string, error?: string): URL {
  const redirectUrl = new URL("/admin/login", `${STORE_RUNTIME.adminUrl.replace(/\/$/, "")}/`);
  redirectUrl.searchParams.set("next", nextPath);
  if (error) {
    redirectUrl.searchParams.set("error", error);
  }
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const nextPath = sanitizeInternalRedirectPath(request.nextUrl.searchParams.get("next"), "/admin");

  if (!shouldUseLogtoAdminAuth()) {
    redirect(buildLoginRedirect(nextPath).toString());
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    redirect(buildLoginRedirect(nextPath, "logto_not_configured").toString());
  }

  await signIn(config, {
    redirectUri: new URL(LOGTO_ADMIN_CALLBACK_PATH, `${config.baseUrl}/`),
    postRedirectUri: nextPath,
  });
}
