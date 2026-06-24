import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Badge,
  Boxes,
  ClipboardCheck,
  FileSpreadsheet,
  Landmark,
  Layers3,
  PackageCheck,
  PackagePlus,
  Printer,
  Route,
  ScanBarcode,
  Settings2,
  Tags,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

type ProductModuleScopeCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type ProductDefinitionCard = {
  title: string;
  description: string;
  status: string;
  href?: string;
  icon: LucideIcon;
};

type ProductModuleReadinessPageProps = {
  title: string;
  description: string;
  status: string;
  statusTone?: StatusTone;
  ctaLabel: string;
  note: string;
  cards: ProductModuleScopeCard[];
  warning?: string;
};

const CARD_CLASSNAME =
  "rounded-[16px] border border-[var(--admin-border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5";

function DisabledModuleAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-[var(--admin-border)] bg-[#F9FAFB] px-4 text-sm font-semibold text-[var(--admin-text-muted)]"
    >
      <PackagePlus className="h-4 w-4" />
      {label}
    </button>
  );
}

export function ProductModuleReadinessPage({
  title,
  description,
  status,
  statusTone = "warning",
  ctaLabel,
  note,
  cards,
  warning,
}: ProductModuleReadinessPageProps) {
  return (
    <main role="main" className="min-h-screen bg-[#F9F9F9]">
      <div className="mx-auto max-w-[1680px] px-3 pb-5 pt-1 sm:px-4 min-[1025px]:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ürünler"
            title={title}
            description={description}
            statusSlot={<AdminStatusBadge tone={statusTone}>{status}</AdminStatusBadge>}
            actions={<DisabledModuleAction label={ctaLabel} />}
          />

          {warning ? (
            <section className="rounded-[16px] border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--admin-warning)] shadow-[var(--shadow-xs)]">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{warning}</p>
              </div>
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className={CARD_CLASSNAME}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-base font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">{card.description}</p>
                </article>
              );
            })}
          </section>

          <section className="rounded-[16px] border border-[var(--admin-border)] bg-white px-4 py-4 text-sm leading-6 text-[var(--admin-text-secondary)] shadow-[var(--shadow-xs)] sm:px-5">
            {note}
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

function DefinitionCard({ card }: { card: ProductDefinitionCard }) {
  const Icon = card.icon;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[var(--admin-border)] bg-[#F9FAFB] text-[var(--admin-text-secondary)]">
          <Icon className="h-5 w-5" />
        </div>
        <AdminStatusBadge tone={card.href ? "success" : "neutral"} size="sm">
          {card.status}
        </AdminStatusBadge>
      </div>
      <h2 className="mt-4 text-base font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">{card.title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">{card.description}</p>
      <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--admin-accent-hover)]">
        {card.href ? "Aç" : "Hazırlık kapsamı"}
        <ArrowRight className="h-4 w-4" />
      </div>
    </>
  );

  if (card.href) {
    return (
      <Link href={card.href} className={cn(CARD_CLASSNAME, "block transition hover:border-[var(--admin-accent-border)] hover:shadow-[var(--shadow-md)]")}>
        {content}
      </Link>
    );
  }

  return (
    <article className={cn(CARD_CLASSNAME, "text-left")}>
      {content}
    </article>
  );
}

export function ProductDefinitionsHubPage() {
  const activeDefinitions: ProductDefinitionCard[] = [
    {
      title: "Kategoriler / Koleksiyonlar",
      description: "Kategori ağacı, vitrin seçimi ve SEO alanları mevcut koleksiyon ekranından yönetilir.",
      status: "Aktif",
      href: "/admin/urunler/koleksiyonlar",
      icon: Layers3,
    },
    {
      title: "Nitelikler / Varyant Türleri",
      description: "Renk, beden ve benzeri varyant değerleri mevcut nitelik yönetimiyle düzenlenir.",
      status: "Aktif",
      href: "/admin/urunler/nitelikler",
      icon: Settings2,
    },
    {
      title: "Ürün Ekstraları / Kişiselleştirme Tanımları",
      description: "Ürüne veya kategoriye bağlanan kişiselleştirme şemaları mevcut ekstralar ekranında yönetilir.",
      status: "Aktif",
      href: "/admin/urunler/ekstralar",
      icon: PackageCheck,
    },
    {
      title: "Markalar",
      description: "Ürünlerde kullanılan marka alanları mevcut marka özet ekranında izlenir.",
      status: "Read-only",
      href: "/admin/urunler/markalar",
      icon: Badge,
    },
  ];

  const plannedDefinitions: ProductDefinitionCard[] = [
    {
      title: "Etiketler",
      description: "Ürün etiketlerini katalog filtreleme ve dışa aktarım hazırlığı için ayrılaştırır.",
      status: "Hazırlık",
      icon: Tags,
    },
    {
      title: "Tedarikçiler",
      description: "Satın alma akışındaki tedarikçi kayıtlarının veri sözlüğü olarak planlanır.",
      status: "Altyapı gerekli",
      icon: Truck,
    },
    {
      title: "Ürün Birimleri",
      description: "Adet, paket, kg ve benzeri satış/stok birimlerini standartlaştırır.",
      status: "Planlandı",
      icon: Boxes,
    },
    {
      title: "Ürün Grupları",
      description: "Ürün ailelerini ve varyant kümelerini ortak katalog diliyle düzenler.",
      status: "Planlandı",
      icon: Route,
    },
  ];

  return (
    <main role="main" className="min-h-screen bg-[#F9F9F9]">
      <div className="mx-auto max-w-[1680px] px-3 pb-5 pt-1 sm:px-4 min-[1025px]:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ürünler"
            title="Tanımlamalar"
            description="Katalog veri sözlüğünü, mevcut yönetim alanlarını ve hazırlık modüllerini tek yerde izleyin."
            statusSlot={<AdminStatusBadge tone="accent">Hub</AdminStatusBadge>}
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--admin-text-secondary)]">
                Aktif alanlar
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {activeDefinitions.map((card) => (
                <DefinitionCard key={card.title} card={card} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--admin-text-secondary)]">
              Hazırlık alanları
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {plannedDefinitions.map((card) => (
                <DefinitionCard key={card.title} card={card} />
              ))}
            </div>
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

export const productModuleIcons = {
  purchase: PackagePlus,
  receiving: ClipboardCheck,
  cost: Landmark,
  inventory: Boxes,
  source: Route,
  target: Truck,
  quantity: PackageCheck,
  approval: ClipboardCheck,
  count: ScanBarcode,
  filteredCount: FileSpreadsheet,
  variance: Layers3,
  price: Tags,
  barcode: Printer,
};
