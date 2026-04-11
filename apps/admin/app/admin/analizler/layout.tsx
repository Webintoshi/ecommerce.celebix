import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analizler",
  description: "Gelir, sipariş, dönüşüm ve canlı trafik verilerini tek ekranda, net ve erişilebilir bir görünümle izleyin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
