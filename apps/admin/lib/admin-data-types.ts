import type { UserRole } from "@/lib/permissions";

export type InitialAdminProfile = {
  email: string;
  fullName: string | null;
  role: UserRole;
};

export type DashboardStats = {
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  lowStockProducts: number;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  shippingAddress: { firstName: string; lastName: string };
  total: number;
  createdAt: string;
  status: string;
};

export type DashboardLowStockProduct = {
  id: string;
  name: string;
  variants: Array<{ name: string; stock: number }>;
};

export type LiveAnalyticsEvent = {
  type: string;
  data: Record<string, unknown>;
  pageUrl: string;
  createdAt: string;
};

export type LiveAnalyticsSnapshot = {
  liveVisitors: number;
  devices: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  topPages: Array<{ url: string; count: number }>;
  abandonedCarts: {
    count: number;
    total: number;
  };
  today: {
    addToCart: number;
    purchases: number;
  };
  recentEvents: LiveAnalyticsEvent[];
};

export type DashboardBootstrapData = {
  stats: DashboardStats;
  recentOrders: DashboardRecentOrder[];
  lowStockProducts: DashboardLowStockProduct[];
  liveData: LiveAnalyticsSnapshot;
};
