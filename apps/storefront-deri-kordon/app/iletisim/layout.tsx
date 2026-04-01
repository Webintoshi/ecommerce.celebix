import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "İletişim | Deri Kordon",
  description:
    "Sorularınız, önerileriniz ve özel sipariş talepleriniz için bizimle iletişime geçin. Telefon: +90 (507) 559-7228 | E-posta: bilgi@derycraft.com",
};

export default function IletisimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
