import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Badge,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
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

type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

type ProductModuleScopeCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type ProductDefinitionItem = {
  title: string;
  scope: string;
  group: string;
  status: string;
  tone: "active" | "readonly" | "prep" | "planned";
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

const DEFINITION_TONES: Record<ProductDefinitionItem["tone"], string> = {
  active: "text-[#109A48]",
  readonly: "text-[#6B7280]",
  prep: "text-[var(--admin-accent-hover)]",
  planned: "text-[#8B95A5]",
};

function DefinitionRow({ item }: { item: ProductDefinitionItem }) {
  const Icon = item.icon;

  return (
    <article className="grid gap-3 border-b border-[#E1E7EF] bg-white px-4 py-4 transition last:border-b-0 hover:bg-[#FFF8F3] sm:px-5 min-[1180px]:grid-cols-[minmax(260px,1.15fr)_minmax(160px,0.55fr)_minmax(150px,0.5fr)_120px] min-[1180px]:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] text-[#4B5563]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">{item.title}</h2>
          <p className="mt-1 truncate text-xs font-medium text-[#8B95A5]">{item.scope}</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Grup</p>
        <p className="mt-1 text-sm font-semibold text-[#374151]">{item.group}</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Durum</p>
        <p className={`mt-1 text-sm font-semibold ${DEFINITION_TONES[item.tone]}`}>{item.status}</p>
      </div>

      <div className="flex justify-start min-[1180px]:justify-end">
        {item.href ? (
          <Link
            href={item.href}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
          >
            Aç
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] px-3 text-sm font-semibold text-[#8B95A5]">
            Bekliyor
          </span>
        )}
      </div>
    </article>
  );
}

export function ProductDefinitionsHubPage() {
  const definitions: ProductDefinitionItem[] = [
    {
      title: "Koleksiyonlar",
      scope: "Kategori ağacı ve koleksiyon yönetimi",
      group: "Katalog",
      status: "Aktif",
      tone: "active",
      href: "/admin/urunler/koleksiyonlar",
      icon: Layers3,
    },
    {
      title: "Markalar",
      scope: "Ürünlerde kullanılan marka alanı",
      group: "Katalog",
      status: "İzleme",
      tone: "readonly",
      href: "/admin/urunler/markalar",
      icon: Badge,
    },
    {
      title: "Etiketler",
      scope: "Ürün etiketleri ve filtre hazırlığı",
      group: "Katalog",
      status: "Hazırlık",
      tone: "prep",
      href: "/admin/urunler/etiketler",
      icon: Tags,
    },
    {
      title: "Nitelikler / Varyant Türleri",
      scope: "Renk, beden ve varyant değerleri",
      group: "Varyant",
      status: "Aktif",
      tone: "active",
      href: "/admin/urunler/nitelikler",
      icon: Settings2,
    },
    {
      title: "Ürün Ekstraları",
      scope: "Kişiselleştirme şemaları",
      group: "Form",
      status: "Aktif",
      tone: "active",
      href: "/admin/urunler/ekstralar",
      icon: PackageCheck,
    },
    {
      title: "Tedarikçiler",
      scope: "Satın alma kaynak kayıtları",
      group: "Operasyon",
      status: "Altyapı gerekli",
      tone: "prep",
      icon: Truck,
    },
    {
      title: "Ürün Birimleri",
      scope: "Adet, paket, kg ve stok birimi",
      group: "Stok",
      status: "Planlandı",
      tone: "planned",
      icon: Boxes,
    },
    {
      title: "Ürün Grupları",
      scope: "Ürün aileleri ve ortak kümeler",
      group: "Katalog",
      status: "Planlandı",
      tone: "planned",
      icon: Route,
    },
  ];
  const activeCount = definitions.filter((item) => item.tone === "active").length;
  const connectedCount = definitions.filter((item) => Boolean(item.href)).length;
  const pendingCount = definitions.filter((item) => item.tone === "prep" || item.tone === "planned").length;

  return (
    <main role="main" className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Katalog"
          title="Tanımlamalar"
          metrics={
            <>
              {[
                { label: "Toplam", value: definitions.length, detail: "alan", icon: Database },
                { label: "Aktif", value: activeCount, detail: "modül", icon: CheckCircle2 },
                { label: "Bağlı", value: connectedCount, detail: "sayfa", icon: ArrowRight },
                { label: "Hazırlık", value: pendingCount, detail: "alan", icon: Clock3 },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                        {metric.label}
                      </p>
                      <Icon className="h-4 w-4 text-[#9CA3AF]" />
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                        {metric.value.toLocaleString("tr-TR")}
                      </p>
                      <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                    </div>
                  </div>
                );
              })}
            </>
          }
        />

        <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 sm:px-5 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Tanım alanları
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#6B7280]">
              <span className="rounded-[8px] bg-white px-3 py-1.5">{connectedCount} bağlı sayfa</span>
              <span className="rounded-[8px] bg-white px-3 py-1.5">{pendingCount} hazırlık</span>
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(260px,1.15fr)_minmax(160px,0.55fr)_minmax(150px,0.5fr)_120px] gap-3 border-b border-[#DCE3EC] bg-[#F7FAFC] px-5 py-3 text-sm font-semibold text-[#4B5563] min-[1180px]:grid">
            <div>Alan</div>
            <div>Grup</div>
            <div>Durum</div>
            <div className="text-right">Aksiyon</div>
          </div>

          <div>
            {definitions.map((item) => (
              <DefinitionRow key={item.title} item={item} />
            ))}
          </div>
        </section>
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
