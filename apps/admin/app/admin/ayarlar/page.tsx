"use client";

import { cn } from "@/lib/utils";
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
    description: "Magaza adi, iletisim bilgileri, para birimi ve zaman dilimi.",
    icon: Store,
    href: "/admin/ayarlar/genel",
    tone: "from-[#fff2e8] to-white text-[#FE6100] border-[#FE6100]/12",
  },
  {
    title: "Kargo ve Teslimat",
    description: "Kargo bolgeleri, ucretler ve kargo firmasi entegrasyonlari.",
    icon: Truck,
    href: "/admin/ayarlar/kargo",
    tone: "from-[#fff6ed] to-white text-[#d66a1f] border-[#f2c79d]",
  },
  {
        title: "Ödeme Yöntemleri",
    description: "Kredi karti, havale/EFT ve kapida odeme ayarlari.",
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
    title: "Dil ve Bolge",
    description: "Magaza dili ve bolgesel ayarlar.",
    icon: Globe2,
    href: "/admin/ayarlar/dil",
    tone: "from-[#fff4ea] to-white text-[#c56a1f] border-[#efceae]",
  },
  {
    title: "Hero Banner",
    description: "Ana sayfa manset alani yonetimi.",
    icon: ImageIcon,
    href: "/admin/ayarlar/hero-banner",
    tone: "from-[#fff3ec] to-white text-[#d55e2d] border-[#f1c5b2]",
  },
  {
    title: "Yapay Zeka",
    description: "Toshi AI asistan ve SEO araclari icin provider ve API key ayarlari.",
    icon: Brain,
    href: "/admin/ayarlar/yapay-zeka",
    tone: "from-[#fff2eb] to-white text-[#b85c3a] border-[#ebc8b8]",
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="inline-flex items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold tracking-[0.18em] text-[#C54E00] uppercase">
            Ayarlar
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {SETTINGS_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex min-h-[240px] flex-col justify-between rounded-[28px] border border-[#eadccd] bg-white/90 p-6 text-left shadow-[0_18px_40px_rgba(99,67,37,0.08)] transition-all hover:-translate-y-1 hover:border-[#FE6100]/22 hover:bg-white hover:shadow-[0_24px_55px_rgba(254,97,0,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
            >
              <div>
                <div
                  className={cn(
                    "mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] border bg-gradient-to-br shadow-sm transition-transform duration-200 group-hover:scale-105",
                    section.tone
                  )}
                >
                  <section.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#2f241d] transition-colors group-hover:text-[#C54E00]">
                  {section.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#7d6959]">{section.description}</p>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-[20px] border border-[#f1e5d9] bg-[#fdf8f3] px-4 py-3 text-sm font-semibold text-[#8a5b3c] transition-all group-hover:border-[#FE6100]/16 group-hover:bg-[#fff7f0] group-hover:text-[#C54E00]">
                <span>Ayari ac</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-r from-[#2f241d] via-[#50382a] to-[#6a4832] p-6 text-white shadow-[0_24px_70px_rgba(47,36,29,0.22)] md:p-8">
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcfaa]">Ek Buyume Alani</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Mobil uygulama hazirlik alanini buradan takip edin</h3>
              <p className="mt-3 text-sm leading-6 text-[#f7ddcb]">
                Magazanizi mobil uygulamaya donusturmek icin ihtiyac duyulan tasarim ve teslim akisini tek alanda toplar.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#3d2b1f] shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25">
              Incelemeye Basla
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="pointer-events-none absolute -bottom-24 right-0 h-52 w-52 rounded-full bg-[#FE6100]/20 blur-3xl" />
        </section>
      </div>
    </div>
  );
}
