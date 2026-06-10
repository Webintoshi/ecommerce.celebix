import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildLocalizedPath } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getPublishedManagedContentPage } from "@/lib/content-pages";
import { prepareAboutPageHtml } from "@/lib/about-page-content";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("hakkimizda");

  return buildStorePageMetadata({
    locale,
    pathname: "/hakkimizda",
    title: managedPage?.seoTitle || `Hakkımızda | ${profile.name}`,
    description:
      managedPage?.seoDescription ||
      `${profile.name} marka hikayesi, mağaza bilgileri ve kurumsal içerikleri.`,
  });
}

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("hakkimizda");
  const aboutHtml = managedPage?.contentHtml
    ? prepareAboutPageHtml(managedPage.contentHtml, managedPage.plainText)
    : "";

  const heroSubtitle =
    managedPage?.seoDescription ||
    (!managedPage?.contentHtml && profile.tagline ? profile.tagline : null);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-[#E8DFD3] bg-[#FBF8F4]">
        <div className="container-premium py-14 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              Hakkımızda
            </p>
            <h1 className="mt-4 font-serif text-[2.15rem] font-medium leading-[1.08] tracking-tight text-neutral-950 sm:text-[2.75rem]">
              {profile.name}
            </h1>
            {heroSubtitle ? (
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-neutral-600 sm:text-[15px]">
                {heroSubtitle}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="container-premium py-12 sm:py-16 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
          <article className="rounded-[1.75rem] border border-[#E5D9CA] bg-white px-6 py-8 sm:px-10 sm:py-10">
            {aboutHtml ? (
              <div
                className="about-managed-content max-w-none text-neutral-700 [&_.about-feature-list]:mt-5 [&_.about-feature-list]:space-y-5 [&_.about-feature-list]:pl-0 [&_.about-feature-list_li]:list-none [&_.about-feature-list_li]:rounded-2xl [&_.about-feature-list_li]:border [&_.about-feature-list_li]:border-[#E8DFD3] [&_.about-feature-list_li]:bg-[#FBF8F4] [&_.about-feature-list_li]:px-5 [&_.about-feature-list_li]:py-4 [&_.about-feature-list_li_strong]:mb-1.5 [&_.about-feature-list_li_strong]:block [&_.about-feature-list_li_strong]:font-serif [&_.about-feature-list_li_strong]:text-lg [&_.about-feature-list_li_strong]:text-neutral-950 [&_.about-feature-list_li_span]:block [&_.about-feature-list_li_span]:text-[15px] [&_.about-feature-list_li_span]:leading-7 [&_.about-feature-list_li_span]:text-neutral-600 [&_.about-section--lead_p]:text-base [&_.about-section--lead_p]:leading-8 [&_.about-section--lead_p]:text-neutral-600 [&_.about-section]:border-b [&_.about-section]:border-[#E8DFD3] [&_.about-section]:pb-8 [&_.about-section]:last:border-b-0 [&_.about-section]:last:pb-0 [&_.about-section_h2]:font-serif [&_.about-section_h2]:text-xl [&_.about-section_h2]:font-medium [&_.about-section_h2]:tracking-tight [&_.about-section_h2]:text-neutral-950 [&_.about-section_h2]:sm:text-2xl [&_.about-section_p]:text-[15px] [&_.about-section_p]:leading-[1.85] [&_.about-section_p]:text-neutral-700 [&_.about-section_p+p]:mt-4 [&_.about-section+_.about-section]:mt-8 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#C7A985] [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-0 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-neutral-950 [&_h2]:sm:text-2xl [&_h3]:mt-6 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:text-neutral-950 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:text-[15px] [&_p]:leading-[1.85] [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: aboutHtml }}
              />
            ) : (
              <div className="space-y-5 text-sm leading-7 text-neutral-600">
                <p>
                  Bu alan admin panelindeki <strong>Hakkımızda</strong> sayfasından yönetilir.
                  İçerik girildiğinde mağaza hikayeniz, üretim yaklaşımınız ve marka anlatınız burada yayınlanır.
                </p>
                <p>
                  Şimdilik bu sayfa genel mağaza ayarlarındaki marka bilgilerini referans alır.
                  Son müşteri metni admin panelinden düzenlenmelidir.
                </p>
              </div>
            )}
          </article>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[1.75rem] border border-[#E5D9CA] bg-[#FBF8F4] px-6 py-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
                İletişim
              </p>
              <h2 className="mt-3 font-serif text-2xl leading-tight text-neutral-950">
                Sorularınız için yanınızdayız
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                Mağaza ziyareti, kişiye özel üretim veya kurumsal talepleriniz için ekibimize
                doğrudan ulaşabilirsiniz.
              </p>

              <ul className="mt-6 space-y-4">
                {profile.phone ? (
                  <li>
                    <a
                      href={`tel:${profile.phoneLink}`}
                      className="group flex items-start gap-3 text-sm text-neutral-700 transition-colors hover:text-[#8B6914]"
                    >
                      <Phone className="mt-0.5 size-4 shrink-0 text-[#8B6914]" strokeWidth={1.75} />
                      <span className="leading-6">{profile.phone}</span>
                    </a>
                  </li>
                ) : null}
                {profile.email ? (
                  <li>
                    <a
                      href={`mailto:${profile.email}`}
                      className="group flex items-start gap-3 text-sm text-neutral-700 transition-colors hover:text-[#8B6914]"
                    >
                      <Mail className="mt-0.5 size-4 shrink-0 text-[#8B6914]" strokeWidth={1.75} />
                      <span className="break-all leading-6">{profile.email}</span>
                    </a>
                  </li>
                ) : null}
                {profile.address ? (
                  <li className="flex items-start gap-3 text-sm leading-6 text-neutral-600">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#8B6914]" strokeWidth={1.75} />
                    <span>{profile.address}</span>
                  </li>
                ) : null}
              </ul>

              <div className="mt-7 flex flex-col gap-3">
                <Link
                  href={buildLocalizedPath("/iletisim", locale, routing)}
                  className="inline-flex items-center justify-center gap-2 border border-neutral-900 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  İletişime geç
                  <ArrowUpRight className="size-4" strokeWidth={1.75} />
                </Link>
                <Link
                  href={buildLocalizedPath("/magazalarimiz", locale, routing)}
                  className="inline-flex items-center justify-center gap-2 border border-[#E5D9CA] bg-white px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900"
                >
                  Mağazalarımız
                  <ArrowUpRight className="size-4" strokeWidth={1.75} />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
