import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terk Edilen Sepetler",
  description:
    "Terk edilen sepetleri, kurtarma oranlarını ve potansiyel gelir fırsatlarını tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AbandonedCartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
