import Link from "next/link";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildLocalizedPath } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getPublishedManagedContentPage } from "@/lib/content-pages";
import {
  resolveFaqIntro,
  resolveFloatingFaqItems,
} from "@/lib/floating-faq";
import { generateFAQSchema } from "@/lib/seo-schema";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("sss");

  return buildStorePageMetadata({
    locale,
    pathname: "/sss",
    title: managedPage?.seoTitle || `SSS | ${profile.name}`,
    description:
      managedPage?.seoDescription ||
      `${profile.name} için sipariş, kargo, iade ve mağaza süreçlerine dair sıkça sorulan sorular.`,
  });
}

export default async function FAQPage() {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("sss");

  const faqItems = resolveFloatingFaqItems(managedPage?.contentHtml);
  const intro = resolveFaqIntro(managedPage?.contentHtml, managedPage?.seoDescription);

  const contactHref = buildLocalizedPath("/iletisim", locale, routing);
  const storesHref = buildLocalizedPath("/magazalarimiz", locale, routing);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQSchema(faqItems)),
        }}
      />

      <section className="border-b border-[#E8DFD3] bg-[#FAF7F2]">
        <div className="container-premium px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[0.62rem] font-medium uppercase tracking-[0.32em] text-[#9A7234]">
              Yardım merkezi
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em] text-[#12100D] sm:text-4xl lg:text-[2.75rem]">
              Sıkça sorulan sorular
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6B5F54] sm:text-[0.94rem]">
              {intro}
            </p>
          </div>
        </div>
      </section>

      <section className="container-premium px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-10">
          <article className="overflow-hidden rounded-[1.5rem] border border-[#E8DFD3] bg-[#FAF7F2] shadow-[0_24px_60px_-40px_rgba(18,16,13,0.18)]">
            <div className="h-px bg-gradient-to-r from-transparent via-[#C4A062] to-transparent" />
            <FaqAccordion items={faqItems} />
          </article>

          <aside className="space-y-4 lg:sticky lg:top-28">
            <div className="rounded-[1.25rem] border border-[#E8DFD3] bg-white p-5 sm:p-6">
              <p className="text-[0.58rem] font-medium uppercase tracking-[0.28em] text-[#9A7234]">
                Hızlı erişim
              </p>
              <h2 className="mt-2 font-serif text-xl font-semibold text-[#12100D]">
                Yardıma mı ihtiyacınız var?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#6B5F54]">
                Aradığınız cevabı bulamadıysanız ekibimiz size yardımcı olur.
              </p>

              <div className="mt-5 space-y-2.5">
                <Link
                  href={contactHref}
                  className="flex items-center justify-between rounded-full border border-[#E8DFD3] bg-[#FAF7F2] px-4 py-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-[#12100D] transition hover:border-[#C4A062]"
                >
                  İletişim
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href={storesHref}
                  className="flex items-center justify-between rounded-full border border-[#E8DFD3] bg-white px-4 py-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-[#12100D] transition hover:border-[#C4A062]"
                >
                  Mağazalarımız
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href={`mailto:${profile.email}`}
                  className="flex items-center justify-between rounded-full border border-[#E8DFD3] bg-white px-4 py-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-[#12100D] transition hover:border-[#C4A062]"
                >
                  E-posta
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href={`tel:${profile.phoneLink}`}
                  className="flex items-center justify-between rounded-full border border-[#E8DFD3] bg-white px-4 py-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-[#12100D] transition hover:border-[#C4A062]"
                >
                  Telefon
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-[#E8DFD3] bg-[#12100D] p-5 text-white sm:p-6">
              <p className="text-[0.58rem] font-medium uppercase tracking-[0.28em] text-[#C4A062]">
                Kurumsal talepler
              </p>
              <p className="mt-2 text-sm leading-6 text-white/78">
                Numune, toplu sipariş ve kişiselleştirme süreçleri için doğrudan bizimle iletişime geçebilirsiniz.
              </p>
              <Link
                href={contactHref}
                className="mt-4 inline-flex rounded-full border border-white/25 px-4 py-2.5 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-[#12100D]"
              >
                Teklif al
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
