import { notFound } from "next/navigation";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { PolicyContentPage } from "@/components/content/PolicyContentPage";
import { getPublishedPolicyPage } from "@/lib/policy-pages";
import { getRequestLocale } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const page = await getPublishedPolicyPage("kvkk");

  return buildStorePageMetadata({
    locale,
    pathname: "/kvkk",
    title: page?.seoTitle || page?.name || "KVKK",
    description:
      page?.seoDescription ||
      "Kişisel verilerin korunmasına dair mağazaya özel politika metni.",
  });
}

export default async function KvkkPage() {
  const page = await getPublishedPolicyPage("kvkk");

  if (!page) {
    notFound();
  }

  return <PolicyContentPage page={page} />;
}
