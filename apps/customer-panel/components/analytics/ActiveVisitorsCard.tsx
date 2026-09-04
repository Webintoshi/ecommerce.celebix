"use client";

import { useEffect, useState } from "react";
import type { AnalyticsActiveVisitors } from "@celebix/saas-contracts";

import { PanelMetricCard } from "@/components/panel/PanelPageShell";
import { createAnalyticsBrowserApi } from "@/lib/analytics-ui/client";
import { createActiveVisitorPoller } from "@/lib/analytics-ui/active-visitors";

const api = createAnalyticsBrowserApi();

export function ActiveVisitorsCard() {
  const [snapshot, setSnapshot] = useState<AnalyticsActiveVisitors | null>(
    null,
  );
  useEffect(() => {
    const poller = createActiveVisitorPoller({
      visible: () => document.visibilityState === "visible",
      now: () => new Date(),
      load: (signal) => api.active(signal),
      publish: setSnapshot,
      schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
      cancel: (timer) => clearTimeout(timer),
    });
    const visibilityChanged = () => poller.visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    poller.start();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      poller.dispose();
    };
  }, []);
  const value =
    snapshot === null
      ? "Analytics kuruluyor"
      : snapshot.status === "unavailable"
        ? "Veri alınamıyor"
        : snapshot.activeVisitors === 1
          ? "1 kişi var"
          : `${snapshot.activeVisitors} kişi var`;
  return <PanelMetricCard label="Şu anda sitenizde" value={value} />;
}
