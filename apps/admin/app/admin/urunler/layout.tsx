import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ürünler",
  description:
    "Ürün kataloğunu, stok durumlarını ve vitrin görünürlüğünü tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
