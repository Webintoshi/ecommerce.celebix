import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/request-locale";
import { getLocalizedCopy } from "@/lib/i18n";
import { buildStorePageMetadata } from "@/lib/seo-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  return buildStorePageMetadata({
    locale,
    pathname: "/iletisim",
    title: copy.contactTitle,
    description: copy.contactDescription,
  });
}

export default function IletisimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
