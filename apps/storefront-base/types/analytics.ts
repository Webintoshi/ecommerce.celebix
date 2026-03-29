export type TimeRange = "today" | "week" | "month" | "quarter" | "year";

export interface AnalyticsEvent {
  id?: string;
  type: "page_view" | "add_to_cart" | "purchase" | "user_signup" | "search" | "filter" | "category_view";
  data: Record<string, unknown>;
  timestamp?: Date;
}

export interface KPI {
  revenue: number;
  orders: number;
  customers: number;
  conversionRate: number;
  avgOrderValue: number;
  pageViews: number;
}

export interface TrendData {
  date: string;
  revenue: number;
  orders: number;
}

export interface CategoryData {
  name: string;
  value: number;
  orders: number;
  growth: number;
}

export interface ProductData {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  growth: number;
  stock: number;
}

export interface CustomerSegment {
  segment: string;
  count: number;
  revenue: number;
  avgOrders: number;
}

export interface AnalyticsStats {
  revenue: number;
  orders: number;
  customers: number;
  conversionRate: number;
  avgOrderValue: number;
  revenueChange: number;
  ordersChange: number;
  customersChange: number;
  conversionChange: number;
}
