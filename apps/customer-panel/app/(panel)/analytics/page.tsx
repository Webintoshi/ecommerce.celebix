import type { Metadata } from "next";
import { PanelAnalyticsView } from "@/components/analytics/PanelAnalyticsView";

export const metadata: Metadata = Object.freeze({
  title: "Analizler | Celebix Panel",
  robots: Object.freeze({ index: false, follow: false }),
});

export default function AnalyticsPage() {
  return <PanelAnalyticsView />;
}
