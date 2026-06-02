import { notFound } from "next/navigation";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { PolicyContentPage } from "@/components/content/PolicyContentPage";
import { getPublishedPolicyPage } from "@/lib/policy-pages";
import { getRequestLocale } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const page = await getPublishedPolicyPage("gizlilik");

  return buildStorePageMetadata({
    locale,
    pathname: "/gizlilik",
    title: page?.seoTitle || page?.name || "Gizlilik Politikası",
    description:
      page?.seoDescription ||
      "Veri işleme ve gizlilik süreçlerine dair mağazaya özel politika metni.",
  });
}

export default async function PrivacyPage() {
  const page = await getPublishedPolicyPage("gizlilik");

  if (!page) {
    notFound();
  }

  return <PolicyContentPage page={page} />;
}
