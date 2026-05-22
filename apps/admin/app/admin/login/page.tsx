import AdminLoginClient from "./AdminLoginClient";
import { LOGTO_ADMIN_SIGN_IN_PATH, shouldUseLogtoAdminAuth } from "@/lib/logto-admin-auth";

export default function AdminLoginPage() {
  return (
    <AdminLoginClient
      logtoSignInPath={shouldUseLogtoAdminAuth() ? LOGTO_ADMIN_SIGN_IN_PATH : null}
    />
  );
}
