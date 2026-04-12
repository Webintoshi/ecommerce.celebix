import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nitelikler",
  description:
    "Varyant niteliklerini, değer setlerini ve ürün kombinasyonlarında kullanılan seçenekleri tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VariantAttributesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
