import { ImageIcon, LayoutTemplate, Megaphone } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/components/admin/AdminPageShell";
import { DesignHeroBannerSection } from "@/components/admin/DesignHeroBannerSection";
import { DesignMarqueeSection } from "@/components/admin/DesignMarqueeSection";
import { DesignPromoBannerSection } from "@/components/admin/DesignPromoBannerSection";

const DESIGN_SECTIONS = [
  {
    id: "hero-banner",
    label: "Manşet",
    title: "Ana manşet",
    description: "İlk ekranda görünen büyük görsel alan.",
    icon: LayoutTemplate,
    status: "Vitrin",
  },
  {
    id: "promosyon-banner",
    label: "Kampanya",
    title: "Kampanya alanları",
    description: "Ana sayfadaki tanıtım kartları.",
    icon: ImageIcon,
    status: "Sıralı",
  },
  {
    id: "marquee",
    label: "Bilgi şeridi",
    title: "Bilgi şeridi",
    description: "Kısa duyuru ve güven mesajları.",
    icon: Megaphone,
    status: "Kısa metin",
  },
] as const;

export default function DesignSettingsPage() {
  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[var(--admin-heading)] sm:px-5 xl:px-6">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="Ayarlar"
          title="Tasarım"
          description="Ana sayfa görsel alanlarını yönetin."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {DESIGN_SECTIONS.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                >
                  <section.icon className="h-4 w-4" />
                  {section.label}
                </Link>
              ))}
            </div>
          }
        />

        <section className="grid gap-px overflow-hidden rounded-[10px] border border-[#E3E7EE] bg-[#E3E7EE] min-[920px]:grid-cols-3">
          {DESIGN_SECTIONS.map((section) => (
            <DesignSummaryCell key={section.id} section={section} />
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden h-fit xl:sticky xl:top-4 xl:block">
            <nav className="space-y-1 border-l border-[#E3E7EE] pl-3">
              {DESIGN_SECTIONS.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="group flex items-center justify-between gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-[#667085] transition hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                >
                  <span className="inline-flex items-center gap-2">
                    <section.icon className="h-4 w-4" />
                    {section.label}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D1D8E2] transition group-hover:bg-[#FF6A00]" />
                </Link>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            <DesignSection
              id="hero-banner"
              section={DESIGN_SECTIONS[0]}
              component={DesignHeroBannerSection}
            />
            <DesignSection
              id="promosyon-banner"
              section={DESIGN_SECTIONS[1]}
              component={DesignPromoBannerSection}
            />
            <DesignSection
              id="marquee"
              section={DESIGN_SECTIONS[2]}
              component={DesignMarqueeSection}
            />
          </div>
        </div>
      </AdminPageShell>
    </main>
  );
}

type DesignSectionMeta = (typeof DESIGN_SECTIONS)[number];

function DesignSummaryCell({ section }: { section: DesignSectionMeta }) {
  return (
    <Link
      href={`#${section.id}`}
      className="flex min-h-[86px] items-center gap-3 bg-white px-4 py-4 transition hover:bg-[#FFF8F3] sm:px-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#FFD1B5] bg-[#FFF4EC] text-[#FF6A00]">
        <section.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#182232]">{section.label}</span>
        <span className="mt-1 block truncate text-xs font-medium text-[#667085]">{section.description}</span>
      </span>
    </Link>
  );
}

function DesignSection({
  id,
  section,
  component: Component,
}: {
  id: DesignSectionMeta["id"];
  section: DesignSectionMeta;
  component: ComponentType;
}) {
  const Icon = section.icon;

  return (
    <section id={id} className="scroll-mt-28 border-t border-[#E3E7EE] pt-5 first:border-t-0 first:pt-0">
      <div className="mb-4 flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#FFD1B5] bg-[#FFF4EC] text-[#FF6A00]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-[-0.03em] text-[#111827]">{section.title}</h2>
            <p className="mt-1 text-sm font-medium text-[#667085]">{section.description}</p>
          </div>
        </div>
        <AdminStatusBadge tone="accent" className="w-fit rounded-[8px]">
          {section.status}
        </AdminStatusBadge>
      </div>

      <div className="rounded-[10px] border border-[#E3E7EE] bg-white p-4 shadow-[0_10px_24px_rgba(16,24,40,0.035)] sm:p-5">
        <Component />
      </div>
    </section>
  );
}
