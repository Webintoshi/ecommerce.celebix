import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { handleSignIn } from "@logto/next/server-actions";
import { getLogtoAdminConfig } from "@/app/logto";
import { shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!shouldUseLogtoAdminAuth()) {
    redirect("/admin/login");
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    redirect("/admin/login?error=logto_not_configured");
  }

  try {
    await handleSignIn(config, request.nextUrl.searchParams);
  } catch (error) {
    console.error("Logto admin callback skeleton error:", error);
    redirect("/admin/login?error=logto_callback_failed");
  }

  redirect("/admin");
}
