"use client";

import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bell,
  Brain,
  CreditCard,
  Globe2,
  ImageIcon,
  Settings,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import Link from "next/link";
import type { ElementType } from "react";

type SettingsItem = {
  title: string;
  detail: string;
  href: string;
  icon: ElementType;
  status?: string;
  accent?: boolean;
};

type SettingsGroup = {
  title: string;
  items: SettingsItem[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Mağaza",
    items: [
      {
        title: "Genel Ayarlar",
        detail: "Kimlik, iletişim ve temel mağaza bilgileri.",
        href: "/admin/ayarlar/genel",
        icon: Store,
        status: "Temel",
      },
      {
        title: "Dil ve Bölge",
        detail: "Dil, bölgesel ayarlar ve yerelleştirme.",
        href: "/admin/ayarlar/dil",
        icon: Globe2,
        status: "Yerel",
      },
      {
        title: "Tasarım Ayarları",
        detail: "Hero, banner ve vitrin görünümü.",
        href: "/admin/ayarlar/tasarim",
        icon: ImageIcon,
        status: "Vitrin",
      },
    ],
  },
  {
    title: "Operasyon",
    items: [
      {
        title: "Kargo",
        detail: "Kargo firmaları ve teslimat bölgeleri.",
        href: "/admin/ayarlar/kargo",
        icon: Truck,
        status: "Kritik",
        accent: true,
      },
      {
        title: "Ödeme",
        detail: "Sağlayıcılar ve ödeme hazırlığı.",
        href: "/admin/ayarlar/odeme",
        icon: CreditCard,
        status: "Kritik",
        accent: true,
      },
      {
        title: "Bildirimler",
        detail: "Müşteri ve yönetici bildirimleri.",
        href: "/admin/ayarlar/bildirimler",
        icon: Bell,
        status: "Açık",
      },
      {
        title: "Yöneticiler",
        detail: "Roller ve atanmış hesaplar.",
        href: "/admin/yoneticiler",
        icon: ShieldCheck,
        status: "Güvenlik",
      },
    ],
  },
  {
    title: "Gelişmiş",
    items: [
      {
        title: "Yapay Zeka",
        detail: "Toshi ve SEO provider ayarları.",
        href: "/admin/ayarlar/yapay-zeka",
        icon: Brain,
        status: "Modül",
      },
    ],
  },
];

function MetricCell({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7D8795]">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</span>
        <span className="pb-1 text-sm font-medium text-[#667085]">{context}</span>
      </div>
    </div>
  );
}

function SettingsRow({ item }: { item: SettingsItem }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="grid min-h-[76px] gap-3 px-4 py-3.5 transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] min-[860px]:grid-cols-[minmax(0,1fr)_130px_40px] min-[860px]:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border bg-white text-[#7D8795]",
            item.accent ? "border-[#FFC7A8] text-[#FF6A00]" : "border-[#DCE3EC]",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#182232]">{item.title}</span>
          <span className="mt-1 block truncate text-xs text-[#667085]">{item.detail}</span>
        </span>
      </div>
      <span
        className={cn(
          "w-fit rounded-[8px] border px-2.5 py-1 text-xs font-semibold min-[860px]:justify-self-start",
          item.accent
            ? "border-[#FFC7A8] bg-[#FFF4EC] text-[#C24D00]"
            : "border-[#DCE3EC] bg-[#F9F9F9] text-[#667085]",
        )}
      >
        {item.status ?? "Açık"}
      </span>
      <span className="hidden h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#7D8795] min-[860px]:flex">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

export default function AdminSettingsPage() {
  const totalItems = SETTINGS_GROUPS.reduce((total, group) => total + group.items.length, 0);

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 sm:px-6 lg:px-8">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="Sistem"
          title="Ayarlar"
          description="Mağaza, operasyon ve yetki ayarlarını yönetin."
          metrics={
            <>
              <MetricCell label="Toplam" value={String(totalItems)} context="alan" />
              <MetricCell label="Operasyon" value="4" context="kritik" />
              <MetricCell label="Mağaza" value="3" context="ayar" />
              <MetricCell label="Gelişmiş" value="1" context="modül" />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
          <div className="space-y-4">
            {SETTINGS_GROUPS.map((group) => (
              <section
                key={group.title}
                className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]"
              >
                <div className="flex items-center justify-between border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
                  <h2 className="text-sm font-semibold text-[#182232]">{group.title}</h2>
                  <span className="text-xs font-medium text-[#667085]">{group.items.length} alan</span>
                </div>
                <div className="divide-y divide-[#E3E9F0]">
                  {group.items.map((item) => (
                    <SettingsRow key={item.href} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="h-fit rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#FFC7A8] bg-[#FFF4EC] text-[#FF6A00]">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#182232]">Ayar merkezi</h2>
                <p className="mt-1 text-sm leading-6 text-[#667085]">
                  Kritik operasyon alanları kargo, ödeme ve yönetici yetkilerinde toplanır.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between border-t border-[#E3E9F0] pt-3">
                <span className="text-[#667085]">Renk standardı</span>
                <span className="font-semibold text-[#FF6A00]">Celebix</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#667085]">Arkaplan</span>
                <span className="font-semibold text-[#182232]">#F9F9F9</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#667085]">Kapsam</span>
                <span className="font-semibold text-[#182232]">Ortak admin</span>
              </div>
            </div>
          </aside>
        </div>
      </AdminPageShell>
    </main>
  );
}
