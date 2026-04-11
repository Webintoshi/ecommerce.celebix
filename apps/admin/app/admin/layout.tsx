import { getAdminAuthContext } from "@/lib/admin-auth";
import { withServerTimeout } from "@/lib/server-timeout";
import AdminLayoutClient from "./AdminLayoutClient";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let auth = null;

  try {
    auth = await withServerTimeout(
      getAdminAuthContext(),
      5000,
      "Admin profil yüklemesi zaman aşımına uğradı."
    );
  } catch (error) {
    console.error("Admin layout auth bootstrap error:", error);
  }

  const initialProfile = auth
    ? {
        email: auth.profile.email,
        fullName: auth.profile.full_name,
        role: auth.profile.role,
      }
    : null;

  return (
    <AdminLayoutClient initialProfile={initialProfile}>
      {children}
    </AdminLayoutClient>
  );
}
