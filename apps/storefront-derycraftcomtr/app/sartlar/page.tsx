import { Scale, Shield, Wallet, ScrollText } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/sartlar",
    title: `Terms of Service | ${profile.name}`,
    description:
      `Core terms, contact details and operating principles for using the ${profile.name} storefront.`,
  });
}

export default async function TermsPage() {
  const profile = await getStorefrontProfile();

  const sections = [
    {
      title: "General Use",
      text: `The ${profile.name} storefront is the official digital showcase for published products, pages and order flows. Using the site means accepting the published policies and terms.`,
      icon: ScrollText,
    },
    {
      title: "Orders and Payment",
      text: "Orders are confirmed after stock and payment verification. Prices, campaigns and operating terms may be updated; the information at confirmation time is accepted as the basis for the order.",
      icon: Wallet,
    },
    {
      title: "Content and Brand Rights",
      text: "Site content, visuals, brand elements and published product cards are used for the operation of the related store brand. Unauthorized copying or malicious use is not accepted.",
      icon: Shield,
    },
    {
      title: "Legal Framework",
      text: "Relevant legislation, distance sales rules and consumer law apply to disputes. Operational contact details are kept up to date on this page and in the contact section.",
      icon: Scale,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Legal Framework
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Terms of service, clear and aligned with operations
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            This page collects the core terms for the storefront, order and support flows published for {profile.name}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article
                key={section.title}
                className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7B1113]/8 text-[#7B1113]">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[#18110B]">{section.title}</h2>
                <p className="mt-4 text-sm leading-7 text-[#5F5147]">{section.text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 rounded-[32px] bg-[#11192D] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/65">
            Contact and Notices
          </p>
          <h2 className="mt-3 text-3xl font-semibold">{profile.name}</h2>
          <div className="mt-5 space-y-2 text-sm leading-7 text-white/78">
            <p>{profile.address}</p>
            <p>{profile.phone}</p>
            <p>{profile.email}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
