import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Müşteriler",
  description:
    "Müşteri tabanını, sipariş davranışını ve iletişim durumlarını tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
