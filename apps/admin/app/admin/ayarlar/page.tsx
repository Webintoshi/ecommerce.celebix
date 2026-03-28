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
    Brain
} from "lucide-react";
import Link from "next/link";

const SETTINGS_SECTIONS = [
    {
        title: "Genel Ayarlar",
        description: "Mağaza adı, iletişim bilgileri, para birimi ve zaman dilimi.",
        icon: Store,
        href: "/admin/ayarlar/genel",
        color: "bg-blue-50 text-blue-600",
    },
    {
        title: "Kargo & Teslimat",
        description: "Kargo bölgeleri, ücretler ve kargo firması entegrasyonları.",
        icon: Truck,
        href: "/admin/ayarlar/kargo",
        color: "bg-orange-50 text-orange-600",
    },
    {
        title: "Ödeme Yöntemleri",
        description: "Kredi kartı, havale/EFT ve kapıda ödeme ayarları.",
        icon: CreditCard,
        href: "/admin/ayarlar/odeme",
        color: "bg-green-50 text-green-600",
    },
    {
        title: "Bildirimler",
        description: "Müşteri e-postaları, SMS şablonları ve yönetici bildirimleri.",
        icon: Bell,
        href: "/admin/ayarlar/bildirimler",
        color: "bg-purple-50 text-purple-600",
    },
    {
        title: "Yöneticiler & İzinler",
        description: "Yönetici hesapları, roller ve erişim yetkileri.",
        icon: ShieldCheck,
        href: "/admin/yoneticiler",
        color: "bg-gray-50 text-gray-600",
    },
    {
        title: "Dil & Bölge",
        description: "Mağaza dili ve bölgesel ayarlar.",
        icon: Globe2,
        href: "/admin/ayarlar/dil",
        color: "bg-teal-50 text-teal-600",
    },
    {
        title: "Hero Banner",
        description: "Ana sayfa manşet alanı yönetimi.",
        icon: ImageIcon,
        href: "/admin/ayarlar/hero-banner",
        color: "bg-pink-50 text-pink-600",
    },
    {
        title: "Yapay Zeka",
        description: "Toshi AI asistan ve SEO araçları için provider ve API key ayarları.",
        icon: Brain,
        href: "/admin/ayarlar/yapay-zeka",
        color: "bg-purple-50 text-purple-600",
    },
];

export default function SettingsPage() {
    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Ayarlar</h1>
                <p className="text-sm text-gray-500 mt-1">Mağazanızın tüm yapılandırma ayarlarını buradan yönetin.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SETTINGS_SECTIONS.map((section) => (
                    <Link
                        key={section.href}
                        href={section.href}
                        className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                    >
                        <div>
                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors", section.color)}>
                                <section.icon className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                {section.title}
                            </h3>
                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                                {section.description}
                            </p>
                        </div>

                        <div className="mt-6 flex items-center text-sm font-medium text-gray-400 group-hover:text-blue-600 transition-colors">
                            Ayarları Yönet
                            <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Quick Links / Promo Area for Integrations or Upgrades can go here */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h3 className="text-lg font-semibold">Mobil Uygulama Hazır mı?</h3>
                    <p className="text-gray-300 mt-2 max-w-xl text-sm leading-relaxed">
                        Mağazanızı bir mobil uygulamaya dönüştürmek artık çok kolay. App Store ve Google Play&apos;de yerinizi alın, satışlarınızı artırın.
                    </p>
                </div>
                <button className="px-6 py-2.5 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors text-sm whitespace-nowrap">
                    İncelemeye Başla
                </button>
            </div>
        </div>
    );
}
