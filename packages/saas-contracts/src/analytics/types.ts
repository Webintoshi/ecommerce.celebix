export const ANALYTICS_PERIODS = Object.freeze(["today", "week", "month", "year"] as const);
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface AnalyticsSeriesPoint {
  readonly startsAt: string;
  readonly orders: number;
  readonly revenueCents: number;
}

export interface AnalyticsTopProduct {
  readonly productId: string;
  readonly title: string;
  readonly quantity: number;
  readonly revenueCents: number;
}

export interface AnalyticsDashboard {
  readonly period: AnalyticsPeriod;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly generatedAt: string;
  readonly currency: string;
  readonly revenueCents: number;
  readonly orders: Readonly<{
    total: number;
    paid: number;
    cancelled: number;
    refunded: number;
  }>;
  readonly customers: Readonly<{
    total: number;
    newInPeriod: number;
  }>;
  readonly catalog: Readonly<{
    activeProducts: number;
    lowStockVariants: number;
  }>;
  readonly series: readonly AnalyticsSeriesPoint[];
  readonly topProducts: readonly AnalyticsTopProduct[];
}
