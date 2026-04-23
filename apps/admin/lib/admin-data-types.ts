import type { UserRole } from "@/lib/permissions";
import type { TimeRange } from "@/types/analytics";

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
  customerId?: string | null;
  customerName?: string;
  shippingAddress: { firstName: string; lastName: string };
  total: number;
  createdAt: string;
  status: string;
};

export type DashboardLowStockProduct = {
  id: string;
  name: string;
  imageUrl?: string | null;
  variantName?: string;
  sku?: string | null;
  stock?: number;
  variants: Array<{ name: string; stock: number }>;
};

export type DashboardOverviewCard = {
  key: "orders" | "revenue" | "conversion" | "pending";
  label: string;
  value: number;
  change: number;
  href: string;
  format: "number" | "currency" | "percent";
  tone: "orange" | "emerald" | "violet" | "amber";
  trend: number[];
};

export type DashboardOverview = {
  timeRange: TimeRange;
  cards: DashboardOverviewCard[];
};

export type DashboardPerformancePoint = {
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
};

export type DashboardPerformance = {
  timeRange: TimeRange;
  currentLabel: string;
  previousLabel: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
  chart: DashboardPerformancePoint[];
};

export type DashboardAnalysisSummaryItem = {
  key: "visitors" | "pageViews" | "addToCart" | "purchases";
  label: string;
  value: number;
  change: number;
  tone: "violet" | "sky" | "amber" | "orange";
};

export type DashboardAnalysisSummary = {
  items: DashboardAnalysisSummaryItem[];
};

export type DashboardCustomerActivity = {
  id: string;
  type: "order" | "review" | "customer";
  customerName: string;
  summary: string;
  createdAt: string;
  href: string;
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
  overview: DashboardOverview;
  performance: DashboardPerformance;
  analysisSummary: DashboardAnalysisSummary;
  customerActivities: DashboardCustomerActivity[];
};

export type AdminPaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminProductVariant = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  stock: number;
  sku: string;
};

export type AdminProductListItem = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt?: string | null;
  publishedAt?: string | null;
  description: string;
  shortDescription: string;
  images: string[];
  category: string;
  subcategory: string;
  tags: string[];
  variants: AdminProductVariant[];
  isActive: boolean;
  isDraft: boolean;
  status: string;
  featured: boolean;
  isNew: boolean;
};
