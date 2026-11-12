import type { UserRole } from "./permissions";

export type LegacyAdminApiScope = "admin" | "orders" | "settings" | "media";

const rolesByScope: Record<LegacyAdminApiScope, readonly UserRole[]> = {
    admin: ["super_admin", "product_manager", "content_creator", "order_manager"],
    orders: ["super_admin", "order_manager"],
    settings: ["super_admin"],
    media: ["super_admin", "product_manager", "content_creator"],
};

export function legacyAdminRoleAllowed(role: unknown, scope: LegacyAdminApiScope = "admin"): role is UserRole {
    return rolesByScope[scope].some((allowed) => role === allowed);
}

function routeIs(pathname: string, prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function legacyAdminApiScope(pathname: string, method: string): LegacyAdminApiScope | null {
    const path = pathname.replace(/\/+$/, "");
    if (path === "/api/customers/create-from-auth") return null;

    if (
        routeIs(path, "/api/orders") ||
        routeIs(path, "/api/abandoned-carts") ||
        routeIs(path, "/api/customers") ||
        routeIs(path, "/api/admin/orders") ||
        routeIs(path, "/api/admin/customers")
    ) return "orders";

    if (
        routeIs(path, "/api/admin/payments") ||
        routeIs(path, "/api/admin/seed") ||
        routeIs(path, "/api/admin/marketing/email/settings") ||
        path === "/api/migrate"
    ) return "settings";

    if (routeIs(path, "/api/upload")) return "media";
    if (routeIs(path, "/api/lucky-wheel/admin") || routeIs(path, "/api/admin/discounts/lucky-wheel")) return "orders";

    if (
        routeIs(path, "/api/admin") ||
        routeIs(path, "/api/settings") ||
        routeIs(path, "/api/pages") ||
        routeIs(path, "/api/seo") ||
        routeIs(path, "/api/revalidate") ||
        path === "/api/products" ||
        (path === "/api/categories" && method !== "GET") ||
        (["GET", "HEAD"].includes(method) && [
            "/api/analytics/dashboard", "/api/analytics/ga4", "/api/analytics/heartbeat", "/api/analytics/live",
        ].includes(path))
    ) return "admin";

    return null;
}

export function legacyAdminPageScope(pathname: string): LegacyAdminApiScope {
    if ([
        "/admin/siparisler", "/admin/musteriler", "/admin/sepetler", "/admin/indirimler/sans-carki",
    ].some((path) => routeIs(pathname, path))) {
        return "orders";
    }
    if (
        routeIs(pathname, "/admin/pazarlama/email") ||
        ["genel", "odeme", "kargo", "bildirimler", "dil", "yapay-zeka"]
            .some((area) => routeIs(pathname, `/admin/ayarlar/${area}`))
    ) {
        return "settings";
    }
    return "admin";
}
