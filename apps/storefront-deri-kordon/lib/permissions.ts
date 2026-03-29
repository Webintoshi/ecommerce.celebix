export type UserRole = "super_admin" | "product_manager" | "content_creator" | "order_manager";

export type AdminPermission =
  | "accounting.view"
  | "accounting.manage"
  | "accounting.integrations.manage";

export const ROLES: Record<UserRole, string> = {
  super_admin: "Süper Yönetici",
  product_manager: "Ürün Yöneticisi",
  content_creator: "İçerik Editörü",
  order_manager: "Sipariş Yöneticisi",
};

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  task_definition?: string;
  created_at: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"],
  product_manager: [
    "/admin",
    "/admin/urunler",
    "/admin/kategoriler",
    "/admin/ozellikler",
    "/admin/stok",
  ],
  content_creator: [
    "/admin",
    "/admin/blog",
    "/admin/sayfalar",
    "/admin/medya",
    "/admin/seo-killer",
    "/admin/seo-hub",
    "/admin/seo-hub/*",
  ],
  order_manager: [
    "/admin",
    "/admin/siparisler",
    "/admin/musteriler",
    "/admin/kuponlar",
    "/admin/sepetler",
  ],
};

export const ROLE_ACTION_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  super_admin: ["accounting.view", "accounting.manage", "accounting.integrations.manage"],
  product_manager: [],
  content_creator: [],
  order_manager: [],
};

export function hasPermission(role: UserRole, path: string): boolean {
  if (role === "super_admin") return true;

  const allowedPaths = ROLE_PERMISSIONS[role];
  if (!allowedPaths) return false;

  return allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function hasActionPermission(role: UserRole, permission: AdminPermission): boolean {
  if (role === "super_admin") return true;
  const allowed = ROLE_ACTION_PERMISSIONS[role] || [];
  return allowed.includes(permission);
}

export function getRoleLabel(role: UserRole): string {
  return ROLES[role] || role;
}
