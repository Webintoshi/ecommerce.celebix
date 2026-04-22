import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
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

      <section className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
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
      </section>
    </div>
  );
}
