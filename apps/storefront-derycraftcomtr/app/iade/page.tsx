import { notFound } from "next/navigation";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { PolicyContentPage } from "@/components/content/PolicyContentPage";
import { getPublishedPolicyPage } from "@/lib/policy-pages";
import { getRequestLocale } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const page = await getPublishedPolicyPage("iade");

  return buildStorePageMetadata({
    locale,
    pathname: "/iade",
    title: page?.seoTitle || page?.name || "Delivery and Returns Policy",
    description:
      page?.seoDescription ||
      "Store-specific policy text about delivery, returns and exchange processes.",
  });
}

export default async function ReturnsPage() {
  const page = await getPublishedPolicyPage("iade");

  if (!page) {
    notFound();
  }

  return <PolicyContentPage page={page} />;
}
