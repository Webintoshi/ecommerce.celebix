"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Users2,
} from "lucide-react";

type Channel = {
  id: "email" | "whatsapp" | "phone";
  title: string;
  description: string;
  href: string;
  metric: string;
};

type Insight = {
  id: string;
  title: string;
  value: number;
  subValue: string;
  change: string;
  actionLabel: string;
  actionHref: string;
  type: "warning" | "success" | "info";
};

type MarketingOverview = {
  stats: {
    totalCustomers: number;
    emailReachable: number;
    phoneReachable: number;
    vipCustomers: number;
    newCustomers30d: number;
    totalRevenue: number;
    monthRevenue: number;
    revenueChange: number;
    customerChange: number;
    contactMissing: number;
  };
  channels: Channel[];
  insights: Insight[];
};

const CHANNEL_ICON: Record<Channel["id"], typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  phone: Phone,
};

const CHANNEL_COLOR: Record<Channel["id"], string> = {
  email: "bg-blue-50 text-blue-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  phone: "bg-purple-50 text-purple-600",
};

const INSIGHT_BADGE: Record<Insight["type"], string> = {
  warning: "bg-amber-50 text-amber-600",
  success: "bg-emerald-50 text-emerald-600",
  info: "bg-blue-50 text-blue-600",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function MarketingPage() {
  const [data, setData] = useState<MarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/marketing/overview", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Pazarlama verileri alınamadı.");
      }

      setData({
        stats: result.stats,
        channels: result.channels,
        insights: result.insights,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const stats = data?.stats || {
    totalCustomers: 0,
    emailReachable: 0,
    phoneReachable: 0,
    vipCustomers: 0,
    newCustomers30d: 0,
    totalRevenue: 0,
    monthRevenue: 0,
    revenueChange: 0,
    customerChange: 0,
    contactMissing: 0,
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-widest">
            <Target className="w-3.5 h-3.5" />
            Büyüme ve Sadakat
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Pazarlama Merkezi</h1>
          <p className="text-gray-500 text-sm max-w-xl">
            Müşteri verilerini canlı olarak analiz edin, segmentleyin ve çalışan pazarlama kanallarına hızlıca geçin.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/admin/musteriler/segmentler"
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
          >
            <Users2 className="w-4 h-4" />
            Segmentler
          </Link>
          <Link
            href="/admin/pazarlama/email"
            className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all flex items-center gap-2 shadow-lg shadow-gray-900/10"
          >
            <Sparkles className="w-4 h-4" />
            Kampanya Oluştur
          </Link>
          <button
            onClick={loadOverview}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            aria-label="Pazarlama verilerini yenile"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Toplam Müşteri</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalCustomers}</p>
          <div className="mt-4 text-xs font-medium text-blue-700 bg-blue-50 w-fit px-2 py-1 rounded-full">
            Son 30 gün: {stats.newCustomers30d}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Aylık Ciro</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(stats.monthRevenue)}</p>
          <div className="mt-4 text-xs font-medium text-emerald-700 bg-emerald-50 w-fit px-2 py-1 rounded-full">
            {stats.revenueChange >= 0 ? "+" : ""}%{stats.revenueChange} geçen aya göre
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
            <BarChart3 className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Toplam Ciro</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalRevenue)}</p>
          <div className="mt-4 text-xs font-medium text-amber-700 bg-amber-50 w-fit px-2 py-1 rounded-full">
            VIP müşteri: {stats.vipCustomers}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">İletişim Kapsaması</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.emailReachable + stats.phoneReachable}</p>
          <div className="mt-4 text-xs font-medium text-purple-700 bg-purple-50 w-fit px-2 py-1 rounded-full">
            Eksik bilgi: {stats.contactMissing}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Pazarlama Kanalları</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data?.channels || []).map((channel) => {
              const Icon = CHANNEL_ICON[channel.id];
              return (
                <Link
                  key={channel.id}
                  href={channel.href}
                  className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${CHANNEL_COLOR[channel.id]}`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{channel.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6">{channel.description}</p>
                  </div>
                  <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500">{channel.metric}</span>
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-all">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Öneriler</h2>
          <div className="space-y-4">
            {(data?.insights || []).map((insight) => (
              <div key={insight.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700">{insight.title}</span>
                  <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${INSIGHT_BADGE[insight.type]}`}>
                    {insight.change}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{insight.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{insight.subValue}</div>
                </div>
                <Link
                  href={insight.actionHref}
                  className="block w-full py-2.5 bg-gray-50 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-900 hover:text-white transition-all text-center"
                >
                  {insight.actionLabel}
                </Link>
              </div>
            ))}

            <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl text-white relative overflow-hidden shadow-xl">
              <div className="relative z-10">
                <h4 className="text-lg font-bold mb-2">Canlı Segment Önerisi</h4>
                <p className="text-gray-300 text-xs leading-relaxed mb-4">
                  Son 30 günde yeni gelen müşterileri ayrı bir segmente alıp WhatsApp + e-posta kombinasyonu ile tekrar satın alma akışı başlatın.
                </p>
                <Link
                  href="/admin/musteriler/segmentler"
                  className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 transition-all"
                >
                  Segmentlere Git
                </Link>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
