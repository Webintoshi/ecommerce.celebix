import { getAdminAuthContext } from "@/lib/admin-auth";
import AdminLayoutClient from "./AdminLayoutClient";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAdminAuthContext();
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
