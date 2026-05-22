import AdminLoginClient from "./AdminLoginClient";
import { redirect } from "next/navigation";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { getLogtoAdminAuthContext } from "@/lib/logto-admin-auth";
import { LOGTO_ADMIN_SIGN_IN_PATH, shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

type AdminLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (shouldUseLogtoAdminAuth()) {
    const auth = await getLogtoAdminAuthContext();
    if (auth) {
      const resolvedSearchParams = searchParams ? await searchParams : {};
      const nextParam = Array.isArray(resolvedSearchParams.next)
        ? resolvedSearchParams.next[0]
        : resolvedSearchParams.next;
      redirect(sanitizeInternalRedirectPath(nextParam ?? null, "/admin"));
    }
  }

  return (
    <AdminLoginClient
      logtoSignInPath={shouldUseLogtoAdminAuth() ? LOGTO_ADMIN_SIGN_IN_PATH : null}
    />
  );
}
