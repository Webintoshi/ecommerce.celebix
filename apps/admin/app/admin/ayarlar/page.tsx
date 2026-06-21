"use client";

import { cn } from "@/lib/utils";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  Store,
  Truck,
  CreditCard,
  Bell,
  ChevronRight,
  ShieldCheck,
  Globe2,
  ImageIcon,
  Brain,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const SETTINGS_SECTIONS = [
  {
    title: "Genel Ayarlar",
    description: "Mağaza adı, iletişim bilgileri, para birimi ve zaman dilimi.",
    icon: Store,
    href: "/admin/ayarlar/genel",
    tone: "from-white to-white text-[var(--admin-accent)] border-[var(--admin-border)]",
  },
  {
    title: "Kargo ve Teslimat",
    description: "Kargo bölgeleri, ücretler ve kargo firması entegrasyonları.",
    icon: Truck,
    href: "/admin/ayarlar/kargo",
    tone: "from-[#fff6ed] to-white text-[#d66a1f] border-[#f2c79d]",
  },
  {
    title: "Ödeme Yöntemleri",
    description: "Kredi kartı, havale/EFT ve kapıda ödeme ayarları.",
    icon: CreditCard,
    href: "/admin/ayarlar/odeme",
    tone: "from-[#fff4ec] to-white text-[#c6541f] border-[#f0c4ac]",
  },
  {
    title: "Bildirimler",
    description: "Müşteri e-postaları, SMS şablonları ve yönetici bildirimleri.",
    icon: Bell,
    href: "/admin/ayarlar/bildirimler",
    tone: "from-[#fdf1e7] to-white text-[#b86a32] border-[#edd2b7]",
  },
  {
    title: "Yöneticiler ve İzinler",
    description: "Yönetici hesapları, roller ve erişim yetkileri.",
    icon: ShieldCheck,
    href: "/admin/yoneticiler",
    tone: "from-[#f7efe8] to-white text-[#7c5a47] border-[#e3d4c6]",
  },
  {
    title: "Dil ve Bölge",
    description: "Mağaza dili ve bölgesel ayarlar.",
    icon: Globe2,
    href: "/admin/ayarlar/dil",
    tone: "from-white to-white text-[#c56a1f] border-[#efceae]",
  },
  {
    title: "Tasarım Ayarları",
    description: "Hero banner, promosyon banner ve kayan yazı alanlarını tek yerden yönetin.",
    icon: ImageIcon,
    href: "/admin/ayarlar/tasarim",
    tone: "from-white to-white text-[#d55e2d] border-[#f1c5b2]",
  },
  {
    title: "Yapay Zeka",
    description: "Toshi AI asistanı ve SEO araçları için provider ve API key ayarları.",
    icon: Brain,
    href: "/admin/ayarlar/yapay-zeka",
    tone: "from-white to-white text-[#b85c3a] border-[#ebc8b8]",
  },
];

export default function SettingsPage() {
  return (
    <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
      <AdminPageShell className="mx-auto max-w-7xl">
        <AdminPageHeader
          sectionLabel="Sistem"
          title="Ayarlar"
          description="Mağaza, operasyon ve entegrasyon ayarlarını tek merkezden yönetin. Kritik checkout ayarlarında değişiklik yapmadan önce canlı etkiyi kontrol edin."
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {SETTINGS_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex min-h-[220px] flex-col justify-between rounded-[20px] border border-[var(--admin-border)] bg-white p-5 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--admin-accent-border)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] md:rounded-[24px] md:p-6"
            >
              <div>
                <div
                  className={cn(
                    "mb-5 flex h-12 w-12 items-center justify-center rounded-[16px] border bg-gradient-to-br shadow-sm transition-transform duration-200 group-hover:scale-105",
                    section.tone
                  )}
                >
                  <section.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--admin-heading)] transition-colors group-hover:text-[var(--admin-accent-hover)]">
                  {section.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#7d6959]">{section.description}</p>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-[16px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3 text-sm font-semibold text-[var(--admin-text-secondary)] transition-all group-hover:border-[var(--admin-accent-border)] group-hover:bg-[var(--admin-accent-soft)] group-hover:text-[var(--admin-accent-hover)]">
                <span>Ayarı aç</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <section className="relative overflow-hidden rounded-[32px] border border-[var(--admin-border)] bg-gradient-to-r from-[#2f241d] via-[#50382a] to-[#6a4832] p-6 text-white shadow-[var(--shadow-md)] md:p-8">
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcfaa]">Ek Büyüme Alanı</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Mobil uygulama hazırlık alanını buradan takip edin</h3>
              <p className="mt-3 text-sm leading-6 text-[#f7ddcb]">
                Mağazanızı mobil uygulamaya dönüştürmek için ihtiyaç duyulan tasarım ve teslim akışını tek alanda toplar.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[var(--admin-heading)] shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25">
              İncelemeye Başla
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="hidden" />
        </section>
      </AdminPageShell>
    </div>
  );
}
