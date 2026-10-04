"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import type { AnalyticsActiveVisitors } from "@celebix/saas-contracts";

import { createAnalyticsBrowserApi } from "@/lib/analytics-ui/client";
import { createActiveVisitorPoller } from "@/lib/analytics-ui/active-visitors";
import styles from "./commerce-analytics-workspace.module.css";

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
      ? "Yükleniyor"
      : snapshot.status === "unavailable"
        ? "Veri alınamıyor"
        : `${snapshot.activeVisitors} ziyaretçi`;
  return (
    <article className={styles.activeVisitors} role="status" aria-live="polite" aria-atomic="true">
      <Activity size={16} aria-hidden="true" />
      <span className={styles.visitorsLabel}>Şu anda</span>
      <strong>{value}</strong>
    </article>
  );
}
