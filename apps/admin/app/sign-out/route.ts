import { redirect } from "next/navigation";
import { signOut } from "@logto/next/server-actions";
import { getLogtoAdminConfig } from "@/app/logto";
import { shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!shouldUseLogtoAdminAuth()) {
    redirect("/admin/login");
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    redirect("/admin/login");
  }

  await signOut(config, `${config.baseUrl}/admin/login`);
}
