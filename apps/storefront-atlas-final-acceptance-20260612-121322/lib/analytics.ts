import { AnalyticsEvent, TimeRange, KPI, TrendData, CategoryData, ProductData, CustomerSegment } from "@/types/analytics";

// Analytics events storage
let analyticsEvents: AnalyticsEvent[] = [];

// Revenue and sales data storage
let salesData: {
  date: string;
  revenue: number;
  orders: number;
  customers: number;
  pageViews: number;
}[] = [];

// Initialize with empty data
export function initializeAnalytics() {
  if (typeof window === "undefined") {
    // Server-side: skip initialization
    return;
  }

  try {
    const storedEvents = localStorage.getItem("analytics_events");
    const storedSales = localStorage.getItem("analytics_sales");

    if (storedEvents) {
      analyticsEvents = JSON.parse(storedEvents);
    }

    if (storedSales) {
      salesData = JSON.parse(storedSales);
    }
  } catch (error) {
    console.error("Analytics initialization error:", error);
    analyticsEvents = [];
    salesData = [];
  }
}

// Save analytics data
function saveAnalytics() {
  if (typeof window === "undefined") {
    // Server-side: skip saving
    return;
  }

  try {
    localStorage.setItem("analytics_events", JSON.stringify(analyticsEvents));
    localStorage.setItem("analytics_sales", JSON.stringify(salesData));
  } catch (error) {
    console.error("Analytics save error:", error);
  }
}

// Track analytics event
export function trackEvent(event: AnalyticsEvent): void {
  event.id = `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  event.timestamp = event.timestamp || new Date();

  analyticsEvents.push(event);
  saveAnalytics();
}

// Track page view
export function trackPageView(page: string, userId?: string): void {
  trackEvent({
    type: "page_view",
    data: {
      page,
      userId,
      timestamp: new Date(),
    },
  });
}

// Track add to cart
export function trackAddToCart(productId: string, productName: string, price: number): void {
  trackEvent({
    type: "add_to_cart",
    data: {
      productId,
      productName,
      price,
      timestamp: new Date(),
    },
  });
}

// Track purchase
export function trackPurchase(orderId: string, total: number, items: number): void {
  trackEvent({
    type: "purchase",
    data: {
      orderId,
      total,
      items,
      timestamp: new Date(),
    },
  });

  // Update daily sales data
  updateDailySales(new Date(), total, items, 1);
}

// Track user sign up
export function trackUserSignUp(userId: string): void {
  trackEvent({
    type: "user_signup",
    data: {
      userId,
      timestamp: new Date(),
    },
  });
}

// Update daily sales data
function updateDailySales(date: Date, revenue: number, orders: number, customers: number): void {
  const dateKey = date.toISOString().split("T")[0];

  const existingEntry = salesData.find(entry => entry.date === dateKey);

  if (existingEntry) {
    existingEntry.revenue += revenue;
    existingEntry.orders += orders;
    existingEntry.customers += customers;
  } else {
    salesData.push({
      date: dateKey,
      revenue,
      orders,
      customers,
      pageViews: 0,
    });
  }

  saveAnalytics();
}

// Update daily page views
export function updatePageViews(date: Date, views: number): void {
  const dateKey = date.toISOString().split("T")[0];

  const existingEntry = salesData.find(entry => entry.date === dateKey);

  if (existingEntry) {
    existingEntry.pageViews += views;
  } else {
    salesData.push({
      date: dateKey,
      revenue: 0,
      orders: 0,
      customers: 0,
      pageViews: views,
    });
  }

  saveAnalytics();
}

// Get KPIs for time range
export function getKPIs(timeRange: TimeRange): KPI {
  const { startDate, endDate } = getDateRange(timeRange);

  const filteredSales = salesData.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= startDate && entryDate <= endDate;
  });

  const totalRevenue = filteredSales.reduce((sum, entry) => sum + entry.revenue, 0);
  const totalOrders = filteredSales.reduce((sum, entry) => sum + entry.orders, 0);
  const totalCustomers = filteredSales.reduce((sum, entry) => sum + entry.customers, 0);
  const totalPageViews = filteredSales.reduce((sum, entry) => sum + entry.pageViews, 0);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const conversionRate = totalPageViews > 0 ? (totalOrders / totalPageViews) * 100 : 0;

  return {
    revenue: totalRevenue,
    orders: totalOrders,
    customers: totalCustomers,
    conversionRate: Math.round(conversionRate * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue),
    pageViews: totalPageViews,
  };
}

// Get previous period KPIs for comparison
export function getPreviousPeriodKPIs(timeRange: TimeRange): KPI {
  const { startDate, endDate } = getDateRange(timeRange);

  // Calculate previous period dates
  const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - (daysDiff * 24 * 60 * 60 * 1000));

  const filteredSales = salesData.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= previousStartDate && entryDate <= previousEndDate;
  });

  const totalRevenue = filteredSales.reduce((sum, entry) => sum + entry.revenue, 0);
  const totalOrders = filteredSales.reduce((sum, entry) => sum + entry.orders, 0);
  const totalCustomers = filteredSales.reduce((sum, entry) => sum + entry.customers, 0);
  const totalPageViews = filteredSales.reduce((sum, entry) => sum + entry.pageViews, 0);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const conversionRate = totalPageViews > 0 ? (totalOrders / totalPageViews) * 100 : 0;

  return {
    revenue: totalRevenue,
    orders: totalOrders,
    customers: totalCustomers,
    conversionRate: Math.round(conversionRate * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue),
    pageViews: totalPageViews,
  };
}

// Get trend data
export function getTrendData(timeRange: TimeRange): TrendData[] {
  const { startDate, endDate } = getDateRange(timeRange);

  const filteredSales = salesData
    .filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate >= startDate && entryDate <= endDate;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return filteredSales.map(entry => ({
    date: formatDate(entry.date),
    revenue: entry.revenue,
    orders: entry.orders,
  }));
}

// Get category data
export function getCategoryData(timeRange: TimeRange): CategoryData[] {
  // This would be calculated from orders and products
  // For now, return empty until orders are implemented
  return [];
}

// Get product performance data
export function getProductPerformance(timeRange: TimeRange): ProductData[] {
  // This would be calculated from orders
  // For now, return empty until orders are implemented
  return [];
}

// Get customer segments
export function getCustomerSegments(timeRange: TimeRange): CustomerSegment[] {
  // This would be calculated from customer data
  // For now, return empty until customers are implemented
  return [];
}

// Get active visitors count
export function getActiveVisitors(): number {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const activePageViews = analyticsEvents.filter(event => {
    if (event.type === "page_view") {
      const eventTime = event.data.timestamp as Date;
      return eventTime >= fiveMinutesAgo && eventTime <= now;
    }
    return false;
  });

  // Count unique users
  const uniqueUsers = new Set(activePageViews.map(event => event.data.userId));
  return uniqueUsers.size;
}

// Reset analytics data
export function resetAnalytics(): void {
  analyticsEvents = [];
  salesData = [];
  saveAnalytics();
}

// Export analytics data
export function exportAnalyticsData(timeRange: TimeRange, format: "json" | "csv"): string {
  const { startDate, endDate } = getDateRange(timeRange);

  const filteredSales = salesData.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= startDate && entryDate <= endDate;
  });

  if (format === "json") {
    return JSON.stringify(filteredSales, null, 2);
  } else if (format === "csv") {
    const headers = "Date,Revenue,Orders,Customers,PageViews\n";
    const rows = filteredSales.map(entry =>
      `${entry.date},${entry.revenue},${entry.orders},${entry.customers},${entry.pageViews}`
    ).join("\n");
    return headers + rows;
  }

  return "";
}

// Helper function to get date range
function getDateRange(timeRange: TimeRange): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate: Date;

  switch (timeRange) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "quarter":
      startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "year":
      startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { startDate, endDate };
}

// Helper function to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString("tr-TR", { month: "short" });
  return `${day} ${month}`;
}
