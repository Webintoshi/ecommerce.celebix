"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHomeView } from "@/components/admin/dashboard/DashboardHomeView";
import type { DashboardBootstrapData } from "@/lib/admin-data-types";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import type { TimeRange } from "@/types/analytics";

export default function AdminDashboardClient({
  initialData,
  initialError = "",
}: {
  initialData: DashboardBootstrapData;
  initialError?: string;
}) {
  const [dashboard, setDashboard] = useState<DashboardBootstrapData>(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRange>(
    initialData.overview.timeRange || "week",
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);

  const refreshDashboard = useCallback(async (timeRange: TimeRange) => {
    try {
      setIsRefreshing(true);
      setErrorMessage("");

      const response = await fetchAdminJson<{
        success: boolean;
        data: DashboardBootstrapData;
      }>(`/api/admin/dashboard-bootstrap?timeRange=${timeRange}`, {
        timeoutMs: 12000,
      });

      if (response.success && response.data) {
        setDashboard(response.data);
      } else {
        setErrorMessage("Dashboard verileri şu anda yenilenemedi.");
      }
    } catch (error) {
      console.error("Failed to refresh dashboard:", error);
      setErrorMessage("Dashboard verileri alınırken bir sorun oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPeriod === dashboard.overview.timeRange) {
      return;
    }

    void refreshDashboard(selectedPeriod);
  }, [dashboard.overview.timeRange, refreshDashboard, selectedPeriod]);

  return (
    <DashboardHomeView
      dashboard={dashboard}
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      isRefreshing={isRefreshing}
      errorMessage={errorMessage}
    />
  );
}
