import { ImageIcon, LayoutTemplate, Sparkles } from "lucide-react";
import Link from "next/link";
import { DesignHeroBannerSection } from "@/components/admin/DesignHeroBannerSection";
import { DesignPromoBannerSection } from "@/components/admin/DesignPromoBannerSection";
import { DesignMarqueeSection } from "@/components/admin/DesignMarqueeSection";

const DESIGN_SECTIONS = [
  {
    id: "hero-banner",
    title: "Hero Banner",
    description: "Ana sayfa üst manşeti ve ilk kampanya alanı.",
    icon: LayoutTemplate,
  },
  {
    id: "promosyon-banner",
    title: "Promosyon Banner",
    description: "Orta alanda gösterilen kampanya kartları.",
    icon: ImageIcon,
  },
  {
    id: "marquee",
    title: "Kayan Yazı",
    description: "Ustte hareket eden hizli bilgi seridi.",
    icon: Sparkles,
  },
] as const;

export default function DesignSettingsPage() {
  return (
    <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-none space-y-6">
        <section className="relative overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)] md:p-8">
          <div className="inline-flex items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
            Tasarım Ayarları
          </div>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--admin-heading)]">
              Görsel alanları tek yerden yönetin
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--admin-text-secondary)]">
              Hero banner, promosyon banner ve kayan yazı ayarları artık tek sayfada. Her bölüm kendi içinde kaydolur, diğerini bozmaz.
            </p>
          </div>
          <div className="hidden" />
        </section>

        <section className="sticky top-4 z-20 rounded-[12px] border border-[var(--admin-border)] bg-white p-4 shadow-[var(--shadow-xs)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent)]">Hizli Gecis</p>
              <p className="mt-1 text-sm text-[var(--admin-text-secondary)]">Düzenlemek istediğin bölüme tek tıkla git.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DESIGN_SECTIONS.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[#F9FAFB] px-4 py-2 text-sm font-medium text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)]"
                >
                  <section.icon className="h-4 w-4" />
                  {section.title}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          id="hero-banner"
          className="scroll-mt-32 rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="1. bölüm"
            title="Hero Banner"
            description="Ana sayfada en üstte çıkan büyük manşeti buradan yönet."
          />
          <DesignHeroBannerSection />
        </section>

        <section
          id="promosyon-banner"
          className="scroll-mt-32 rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="2. bölüm"
            title="Promosyon Banner"
            description="Kampanya kutularını, rozetlerini ve görsellerini tek alanda düzenle."
          />
          <DesignPromoBannerSection />
        </section>

        <section
          id="marquee"
          className="scroll-mt-32 rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="3. bölüm"
            title="Kayan Yazı"
            description="Ustte gorunen hizli bilgi metinlerini kolayca ekle, sil ve kaydet."
          />
          <DesignMarqueeSection />
        </section>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 border-b border-[#efe3d7] pb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">{description}</p>
    </div>
  );
}
