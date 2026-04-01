import AdminDashboardClient from "./AdminDashboardClient";
import { getAdminDashboardBootstrapData } from "@/lib/admin-dashboard";
import type { DashboardBootstrapData } from "@/lib/admin-data-types";

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
    const initialData = await getAdminDashboardBootstrapData();
    return <AdminDashboardClient initialData={initialData} />;
  } catch (error) {
    console.error("Admin dashboard page bootstrap error:", error);
    return (
      <AdminDashboardClient
        initialData={getEmptyDashboardData()}
        initialError="Panel verileri simdilik sinirli geldi. Arka planda tekrar deneyebilirsiniz."
      />
    );
  }
}
