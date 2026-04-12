import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Koleksiyonlar",
  description:
    "Koleksiyon ağacını, görünürlüğü ve vitrin düzenini tek ekranda net ve erişilebilir bir görünümle yönetin.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CollectionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
