import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocaleAlternates, buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const localizedPath = buildLocalizedPath("/iletisim", locale);

  return {
    title: copy.contactTitle,
    description: copy.contactDescription,
    alternates: {
      canonical: localizedPath,
      languages: buildLocaleAlternates("/iletisim"),
    },
    openGraph: {
      title: copy.contactTitle,
      description: copy.contactDescription,
      type: "website",
      locale,
      url: localizedPath,
    },
  };
}

export default function IletisimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
