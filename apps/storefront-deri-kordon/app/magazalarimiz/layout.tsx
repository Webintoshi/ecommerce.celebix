import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { translateSeoStrings } from "@/lib/translation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const [title, description] = await translateSeoStrings(
    [
      `Magazalarimiz | ${profile.name}`,
      `${profile.name} Giresun ve Ordu magazalarinin adres, calisma saati ve iletisim bilgileri.`,
    ],
    locale,
    "stores-page-seo",
  );

  return buildStorePageMetadata({
    locale,
    pathname: "/magazalarimiz",
    title,
    description,
    keywords: [
      `${profile.name.toLocaleLowerCase("tr-TR")} magazalari`,
      "giresun deri magazasi",
      "ordu deri magazasi",
    ],
  });
}

export default function StoresLayout({ children }: { children: ReactNode }) {
  return children;
}
