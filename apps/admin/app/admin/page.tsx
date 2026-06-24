import type { Metadata } from "next";
import AdminDashboardClient from "./AdminDashboardClient";
import { getAdminDashboardBootstrapData } from "@/lib/admin-dashboard";
import type { DashboardBootstrapData } from "@/lib/admin-data-types";
import { withServerTimeout } from "@/lib/server-timeout";

export const metadata: Metadata = {
  title: "Ana Panel",
  description: "Mağazanızın performansını, trendlerini ve operasyonel durumunu tek ekranda izleyin.",
  robots: {
    index: false,
    follow: false,
  },
};

function getEmptyDashboardData(): DashboardBootstrapData {
  return {
    stats: {
      totalProducts: 0,
      totalOrders: 0,
      pendingOrders: 0,
      totalRevenue: 0,
      lowStockProducts: 0,
    },
    recentOrders: [],
    lowStockProducts: [],
    liveData: {
      liveVisitors: 0,
      devices: {
        mobile: 0,
        desktop: 0,
        tablet: 0,
      },
      topPages: [],
      topReferrers: [],
      topCountries: [],
      topBrowsers: [],
      abandonedCarts: {
        count: 0,
        total: 0,
      },
      today: {
        addToCart: 0,
        purchases: 0,
      },
      recentEvents: [],
    },
    analyticsStatus: {
      provider: "umami",
      source: "none",
      umami: {
        baseUrlPresent: false,
        apiTokenPresent: false,
        websiteIdPresent: false,
        configured: false,
      },
      storefrontTracking: "unknown",
    },
    overview: {
      timeRange: "week",
      cards: [
        {
          key: "orders",
          label: "Bu Haftaki Siparişler",
          value: 0,
          change: 0,
          href: "/admin/siparisler",
          format: "number",
          tone: "orange",
          trend: [],
        },
        {
          key: "revenue",
          label: "Haftalık Ciro",
          value: 0,
          change: 0,
          href: "/admin/analizler",
          format: "currency",
          tone: "emerald",
          trend: [],
        },
        {
          key: "conversion",
          label: "Dönüşüm Oranı",
          value: 0,
          change: 0,
          href: "/admin/analizler",
          format: "percent",
          tone: "violet",
          trend: [],
        },
        {
          key: "pending",
          label: "Bekleyen Siparişler",
          value: 0,
          change: 0,
          href: "/admin/siparisler",
          format: "number",
          tone: "amber",
          trend: [],
        },
      ],
    },
    performance: {
      timeRange: "week",
      currentLabel: "Bu hafta",
      previousLabel: "Geçen hafta",
      currentRevenue: 0,
      previousRevenue: 0,
      currentOrders: 0,
      previousOrders: 0,
      chart: [],
    },
    analysisSummary: {
      items: [],
    },
    customerActivities: [],
  };
}

export default async function AdminDashboardPage() {
  try {
    const initialData = await withServerTimeout(
      getAdminDashboardBootstrapData({ includeLiveData: false, timeRange: "week" }),
      7000,
      "Panel ilk açılışta zaman aşımına uğradı.",
    );

    return <AdminDashboardClient initialData={initialData} />;
  } catch (error) {
    console.error("Admin dashboard page bootstrap error:", error);
    return (
      <AdminDashboardClient
        initialData={getEmptyDashboardData()}
        initialError="Panel verileri ilk açılışta sınırlı geldi. Arka planda tekrar deneyebilirsiniz."
      />
    );
  }
}
