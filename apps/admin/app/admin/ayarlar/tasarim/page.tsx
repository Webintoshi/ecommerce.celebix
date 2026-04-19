import { ImageIcon, LayoutTemplate, Sparkles } from "lucide-react";
import Link from "next/link";
import { DesignHeroBannerSection } from "@/components/admin/DesignHeroBannerSection";
import { DesignPromoBannerSection } from "@/components/admin/DesignPromoBannerSection";
import { DesignMarqueeSection } from "@/components/admin/DesignMarqueeSection";

const DESIGN_SECTIONS = [
  {
    id: "hero-banner",
    title: "Hero Banner",
    description: "Ana sayfa ust manseti ve ilk kampanya alani.",
    icon: LayoutTemplate,
  },
  {
    id: "promosyon-banner",
    title: "Promosyon Banner",
    description: "Orta alanda gosterilen kampanya kartlari.",
    icon: ImageIcon,
  },
  {
    id: "marquee",
    title: "Kayan Yazi",
    description: "Ustte hareket eden hizli bilgi seridi.",
    icon: Sparkles,
  },
] as const;

export default function DesignSettingsPage() {
  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
            Tasarım Ayarları
          </div>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#2f241d]">
              Görsel alanlari tek yerden yonetin
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#7b685b]">
              Hero banner, promosyon banner ve kayan yazi ayarlari artik tek sayfada. Her bolum kendi icinde kaydolur, digerini bozmaz.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        <section className="sticky top-4 z-20 rounded-[28px] border border-[#ecdccd] bg-white/90 p-4 shadow-[0_18px_40px_rgba(99,67,37,0.08)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FE6100]">Hizli Gecis</p>
              <p className="mt-1 text-sm text-[#7b685b]">Duzenlemek istedigin bolume tek tikla git.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DESIGN_SECTIONS.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadccd] bg-[#fcf7f1] px-4 py-2 text-sm font-medium text-[#7b685b] transition hover:border-[#FE6100]/30 hover:bg-[#fff7f0] hover:text-[#C54E00]"
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
          className="scroll-mt-32 rounded-[32px] border border-[#ecdccd] bg-white/90 p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="1. bolum"
            title="Hero Banner"
            description="Ana sayfada en ustte cikan buyuk manseti buradan yonet."
          />
          <DesignHeroBannerSection />
        </section>

        <section
          id="promosyon-banner"
          className="scroll-mt-32 rounded-[32px] border border-[#ecdccd] bg-white/90 p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="2. bolum"
            title="Promosyon Banner"
            description="Kampanya kutularini, rozetlerini ve gorsellerini tek alanda duzenle."
          />
          <DesignPromoBannerSection />
        </section>

        <section
          id="marquee"
          className="scroll-mt-32 rounded-[32px] border border-[#ecdccd] bg-white/90 p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6"
        >
          <SectionIntro
            eyebrow="3. bolum"
            title="Kayan Yazi"
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#7b685b]">{description}</p>
    </div>
  );
}
