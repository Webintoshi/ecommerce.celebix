import { Mail, MapPin, Phone } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { getPublishedManagedContentPage } from "@/lib/content-pages";

export const dynamic = "force-dynamic";

const CONTACT_PAGE_PHONE = "0545 628 41 52";
const CONTACT_PAGE_ADDRESS =
  "Kar\u015f\u0131yaka Mah. K\u0131br\u0131s Cd. No:49A Alt\u0131nordu/Ordu (Alt\u0131n \u00c7ar\u015f\u0131 i\u00e7erisinde), Ordu 52200";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("iletisim");

  return buildStorePageMetadata({
    locale,
    pathname: "/iletisim",
    title: managedPage?.seoTitle || `İletişim | ${profile.name}`,
    description:
      managedPage?.seoDescription ||
      `${profile.name} ile destek, teklif, toptan satış ve proje talepleri için iletişime geçin.`,
  });
}

export default async function ContactPage() {
  const profile = await getStorefrontProfile();
  const managedPage = await getPublishedManagedContentPage("iletisim");
  const contactPhoneLink = CONTACT_PAGE_PHONE.replace(/\s+/g, "");
  const contactMapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACT_PAGE_ADDRESS)}`;

  const cards = [
    {
      title: "Adres",
      value: CONTACT_PAGE_ADDRESS,
      href: contactMapSearchUrl,
      icon: MapPin,
      linkLabel: "Haritada Aç",
    },
    {
      title: "E-posta",
      value: profile.email,
      href: `mailto:${profile.email}`,
      icon: Mail,
      linkLabel: "Mail Gönder",
    },
    {
      title: "Telefon",
      value: CONTACT_PAGE_PHONE,
      href: `tel:${contactPhoneLink}`,
      icon: Phone,
      linkLabel: "Hemen Ara",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
              İletişim
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
              {profile.name} ile bağlantı kurun
            </h1>
            <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
              {managedPage?.plainText ||
                "İletişim kartları genel ayarlardan, gövde içeriği ise admin panelindeki İletişim sayfasından yönetilir."}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-6 py-12 lg:py-16">
        {managedPage?.contentHtml ? (
          <article className="rounded-[28px] border border-black/5 bg-white p-8 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]">
            <div
              className="prose prose-neutral max-w-none [&_blockquote]:border-l-4 [&_blockquote]:border-[#BAC4D0] [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:pl-6 [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: managedPage.contentHtml }}
            />
          </article>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.title}
                className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
              >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DA630D]/10 text-[#DA630D]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                  {card.title}
                </p>
                <p className="mt-3 text-base leading-7 text-[#221813]">{card.value}</p>
                <a
                  href={card.href}
                    className="mt-5 inline-flex items-center rounded-full border border-[#BAC4D0] px-4 py-2 text-sm font-medium text-[#505E71] transition hover:border-[#505E71] hover:bg-white"
                >
                  {card.linkLabel}
                </a>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
