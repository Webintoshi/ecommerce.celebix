import type { Metadata } from "next";
import AnalyticsPageClient from "./AnalyticsPageClient";

export const metadata: Metadata = {
  title: "Analizler",
  description: "Magazanizin Umami tabanli trafik ve ziyaretci ozetlerini izleyin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
