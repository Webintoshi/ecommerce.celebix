import Link from "next/link";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildLocalizedPath } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getPublishedManagedContentPage } from "@/lib/content-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("hakkimizda");

  return buildStorePageMetadata({
    locale,
    pathname: "/hakkimizda",
    title: managedPage?.seoTitle || `Hakkimizda | ${profile.name}`,
    description:
      managedPage?.seoDescription ||
      `${profile.name} marka hikayesi, magaza bilgileri ve kurumsal detaylari.`,
  });
}

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("hakkimizda");

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Hakkimizda
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            {profile.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            {managedPage?.plainText || profile.tagline}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="rounded-[28px] border border-black/5 bg-white p-8 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]">
            {managedPage?.contentHtml ? (
              <div
                className="prose prose-neutral max-w-none [&_blockquote]:border-l-4 [&_blockquote]:border-[#C7A985] [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:pl-6 [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: managedPage.contentHtml }}
              />
            ) : (
              <div className="space-y-5 text-sm leading-7 text-[#5F5147]">
                <p>
                  Bu alan admin panelindeki <strong>Hakkimizda</strong> sayfasindan yonetilir.
                  Icerik girildiginde magaza hikayeniz, uretim anlayisiniz ve kurumsal anlatiminiz
                  burada yayinlanir.
                </p>
                <p>
                  Simdilik bu sayfa magaza genel ayarlarindaki marka bilgilerini referans aliyor.
                  Musteriye gosterilecek son metni admin panelinden duzenlemeniz gerekir.
                </p>
              </div>
            )}
          </article>

          <aside className="rounded-[28px] bg-[#11192D] px-6 py-8 text-white">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/65">
              Iletisim
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Markanizi acik ve guvenli anlatin</h2>
            <p className="mt-4 text-sm leading-7 text-white/78">
              Destek, teklif ve kurumsal talepler icin iletisim sayfasini da bu akisla birlikte guncelleyebilirsiniz.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={buildLocalizedPath("/iletisim", locale, routing)}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-[#11192D] transition hover:bg-[#F4ECE5]"
              >
                Iletisim sayfasina git
              </Link>
              <a
                href={`mailto:${profile.email}`}
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {profile.email}
              </a>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
