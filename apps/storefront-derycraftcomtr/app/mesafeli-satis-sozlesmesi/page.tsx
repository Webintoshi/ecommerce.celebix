import { notFound } from "next/navigation";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { PolicyContentPage } from "@/components/content/PolicyContentPage";
import { getPublishedPolicyPage } from "@/lib/policy-pages";
import { getRequestLocale } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const page = await getPublishedPolicyPage("mesafeli-satis-sozlesmesi");

  return buildStorePageMetadata({
    locale,
    pathname: "/mesafeli-satis-sozlesmesi",
    title: page?.seoTitle || page?.name || "Distance Sales Agreement",
    description:
      page?.seoDescription ||
      "Store-specific policy text for the distance sales process.",
  });
}

export default async function DistanceSalesAgreementPage() {
  const page = await getPublishedPolicyPage("mesafeli-satis-sozlesmesi");

  if (!page) {
    notFound();
  }

  return <PolicyContentPage page={page} />;
}
