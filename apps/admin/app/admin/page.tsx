import type { Metadata } from "next";
import AdminDashboardClient from "./AdminDashboardClient";
import { getAdminDashboardBootstrapData } from "@/lib/admin-dashboard";
import type { DashboardBootstrapData } from "@/lib/admin-data-types";
import { withServerTimeout } from "@/lib/server-timeout";

export const metadata: Metadata = {
  title: "Ana Panel",
  description: "Yönetim panelinin ana ekranında sipariş, ürün, müşteri ve canlı operasyon verilerini tek bakışta izleyin.",
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
  };
}

export default async function AdminDashboardPage() {
  try {
    const initialData = await withServerTimeout(
      getAdminDashboardBootstrapData(),
      7000,
      "Dashboard ilk açılışta zaman aşımına uğradı."
    );
    return <AdminDashboardClient initialData={initialData} />;
  } catch (error) {
    console.error("Admin dashboard page bootstrap error:", error);
    return (
      <AdminDashboardClient
        initialData={getEmptyDashboardData()}
        initialError="Panel verileri şimdilik sınırlı geldi. Arka planda yeniden deneyebilirsiniz."
      />
    );
  }
}
