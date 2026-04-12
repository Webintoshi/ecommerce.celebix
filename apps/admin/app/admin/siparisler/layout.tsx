import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Siparişler",
  description:
    "Sipariş akışını, ödeme durumlarını ve operasyon önceliklerini tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
