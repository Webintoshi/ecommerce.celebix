"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ChevronRight,
  FileText,
  FolderOpen,
  Package,
  Rocket,
  Star,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";

function calculateScore(hasTitle: boolean, hasDesc: boolean, hasImage: boolean): number {
  let score = 0;
  if (hasTitle) score += 40;
  if (hasDesc) score += 40;
  if (hasImage) score += 20;
  return score;
}

function ScoreBadge({ score }: { score: number }) {
  let tone = "from-rose-500 to-orange-500";
  let ring = "ring-rose-200/70";
  let text = "Geliştirilmeli";

  if (score >= 80) {
    tone = "from-emerald-500 to-teal-500";
    ring = "ring-emerald-200/70";
    text = "Harika";
  } else if (score >= 60) {
    tone = "from-amber-500 to-orange-500";
    ring = "ring-amber-200/80";
    text = "İyi";
  }

  return (
    <div className="flex items-center gap-4">
      <div className={`flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br ${tone} text-2xl font-bold text-white shadow-[0_22px_50px_rgba(120,74,36,0.22)] ring-8 ${ring}`}>
        {score}
      </div>
      <div>
        <div className="text-lg font-semibold tracking-[-0.02em] text-[#2f241d]">{text}</div>
        <div className="text-sm text-[#8f7765]">Genel SEO puanı</div>
      </div>
    </div>
  );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#efe4d8]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          percent >= 80 ? "bg-gradient-to-r from-emerald-500 to-teal-500" : percent >= 50 ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-rose-500 to-orange-500"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_16px_40px_rgba(105,78,54,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#8f7765]">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#2f241d]">{value}</p>
          <p className="mt-2 text-sm text-[#9b816d]">{note}</p>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-[20px] border ${tone}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function BigCard({
  href,
  icon: Icon,
  tone,
  title,
  subtitle,
  count,
  completed,
  score,
}: {
  href: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  subtitle: string;
  count: number;
  completed: number;
  score: number;
}) {
  const percent = count > 0 ? Math.round((completed / count) * 100) : 0;

  return (
    <Link
      href={href}
      className="group block rounded-[32px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
    >
      <div className="h-full rounded-[32px] border border-[#eadccd] bg-white/95 p-7 shadow-[0_18px_45px_rgba(105,78,54,0.08)] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-[#FE6100]/20 group-hover:shadow-[0_24px_60px_rgba(254,97,0,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-16 w-16 items-center justify-center rounded-[22px] border shadow-sm ${tone}`}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#eadccd] bg-[#fffaf5] text-[#8a6f5d] transition-all duration-300 group-hover:border-[#FE6100]/25 group-hover:text-[#C54E00]">
            <ChevronRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#8f7765]">{subtitle}</p>
        </div>

        <div className="mt-6 rounded-[24px] border border-[#f0e3d7] bg-[#fcf8f3] p-4">
          <div className="flex items-center justify-between text-sm text-[#826a5b]">
            <span>Tamamlanan</span>
            <span className="font-semibold text-[#2f241d]">{completed} / {count}</span>
          </div>
          <div className="mt-3">
            <ProgressBar completed={completed} total={count} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-[#9d836f]">
            <span>%{percent} tamamlandı</span>
            <span>Ortalama puan {score}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function SEODashboard() {
  const [stats, setStats] = useState({
    products: { total: 0, completed: 0, avgScore: 0 },
    categories: { total: 0, completed: 0, avgScore: 0 },
    pages: { total: 0, completed: 0, avgScore: 0 },
    overallScore: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const productsRes = await fetch("/api/products");
      const productsData = await productsRes.json();
      const products = productsData.products || [];

      const categoriesRes = await fetch("/api/categories");
      const categoriesData = await categoriesRes.json();
      const categories = categoriesData.categories || [];

      let productCompleted = 0;
      let productTotalScore = 0;
      products.forEach((p: any) => {
        const hasTitle = p.seo_title || p.meta_title;
        const hasDesc = p.seo_description || p.meta_description;
        const hasImage = p.images && p.images.length > 0;
        const score = calculateScore(!!hasTitle, !!hasDesc, hasImage);
        productTotalScore += score;
        if (score >= 60) productCompleted++;
      });

      let categoryCompleted = 0;
      let categoryTotalScore = 0;
      categories.forEach((c: any) => {
        const hasTitle = c.seo_title;
        const hasDesc = c.seo_description;
        const score = calculateScore(!!hasTitle, !!hasDesc, true);
        categoryTotalScore += score;
        if (score >= 60) categoryCompleted++;
      });

      const staticPages = [
        { name: "Ana Sayfa", hasTitle: true, hasDesc: true },
        { name: "Hakkımızda", hasTitle: true, hasDesc: true },
        { name: "İletişim", hasTitle: true, hasDesc: true },
        { name: "SSS", hasTitle: true, hasDesc: true },
        { name: "Gizlilik", hasTitle: false, hasDesc: false },
        { name: "Şartlar", hasTitle: false, hasDesc: false },
      ];

      let pageCompleted = 0;
      let pageTotalScore = 0;
      staticPages.forEach((p: any) => {
        const score = calculateScore(p.hasTitle, p.hasDesc, true);
        pageTotalScore += score;
        if (score >= 60) pageCompleted++;
      });

      const productAvg = products.length > 0 ? Math.round(productTotalScore / products.length) : 0;
      const categoryAvg = categories.length > 0 ? Math.round(categoryTotalScore / categories.length) : 0;
      const pageAvg = Math.round(pageTotalScore / staticPages.length);
      const overall = Math.round((productAvg + categoryAvg + pageAvg) / 3);

      setStats({
        products: {
          total: products.length,
          completed: productCompleted,
          avgScore: productAvg,
        },
        categories: {
          total: categories.length,
          completed: categoryCompleted,
          avgScore: categoryAvg,
        },
        pages: {
          total: staticPages.length,
          completed: pageCompleted,
          avgScore: pageAvg,
        },
        overallScore: overall,
      });
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6efe8] px-6 py-16">
        <div className="mx-auto flex max-w-7xl items-center justify-center rounded-[36px] border border-[#eadccd] bg-white/90 px-8 py-20 shadow-[0_24px_70px_rgba(99,67,37,0.08)]">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#ffd7b8] bg-gradient-to-br from-[#FE6100] to-[#d97706] text-white shadow-[0_22px_50px_rgba(254,97,0,0.22)]">
              <Rocket className="h-7 w-7 animate-pulse" />
            </div>
            <p className="mt-5 text-sm font-medium text-[#7f6858]">SEO merkezi hazırlanıyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6efe8] text-[#2f241d]">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
        <section className="relative overflow-hidden rounded-[36px] border border-[#eadccd] bg-gradient-to-br from-[#fff8f2] via-white to-[#f8eee5] p-8 shadow-[0_24px_80px_rgba(99,67,37,0.10)] md:p-10">
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                SEO operasyon merkezi
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[#ffd7b8] bg-gradient-to-br from-[#FE6100] to-[#d97706] text-white shadow-[0_22px_50px_rgba(254,97,0,0.22)]">
                  <Rocket className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#2f241d] md:text-4xl">SEO Merkezi</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#7f6858] md:text-base">
                    Ürün, kategori ve sabit sayfa performansını tek akışta takip edin; eksikleri sıcak, premium bir yönetim deneyimiyle tamamlayın.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[28px] border border-[#eadccd] bg-white/85 p-5 shadow-[0_16px_45px_rgba(99,67,37,0.08)]">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d836f]">Genel sağlık</span>
                  <Target className="h-4 w-4 text-[#C54E00]" />
                </div>
                <ScoreBadge score={stats.overallScore} />
              </div>

              <div className="rounded-[28px] border border-[#eadccd] bg-[#2f241d] p-5 text-white shadow-[0_20px_55px_rgba(47,36,29,0.20)]">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd8b6]">
                  Bugünün önceliği
                </div>
                <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">
                  Eksik meta sayısı yüksek olan alanları önce kapatın.
                </p>
                <p className="mt-3 text-sm leading-6 text-[#ead9c9]">
                  Önce ürünleri, ardından kategorileri düzenlemek toplam görünürlük skoruna en hızlı etkiyi sağlar.
                </p>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/12 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[#f3cba8]/40 blur-3xl" />
        </section>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard
            icon={Package}
            title="Ürün havuzu"
            value={`${stats.products.total}`}
            note={`${stats.products.completed} ürün SEO eşiğini geçti`}
            tone="border-[#ffd8b8] bg-gradient-to-br from-[#fff3e7] to-white text-[#C54E00]"
          />
          <MetricCard
            icon={FolderOpen}
            title="Kategori yapısı"
            value={`${stats.categories.total}`}
            note={`${stats.categories.completed} kategori hazır durumda`}
            tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600"
          />
          <MetricCard
            icon={FileText}
            title="Sabit sayfalar"
            value={`${stats.pages.total}`}
            note={`${stats.pages.completed} sayfa yayın kalitesinde`}
            tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600"
          />
        </div>

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Hızlı girişler
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">Neyi düzenlemek istiyorsunuz?</h2>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-[#eadccd] bg-white px-4 py-2 text-sm font-medium text-[#856d5c] md:inline-flex">
              <Zap className="h-4 w-4 text-[#C54E00]" />
              Önce eksik alanları kapatın
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <BigCard
              href="/admin/seo-killer/urunler"
              icon={Package}
              tone="border-[#ffd8b8] bg-gradient-to-br from-[#fff3e7] to-white text-[#C54E00]"
              title="Ürünler"
              subtitle="Satıştaki ürünlerin başlık, açıklama ve görsel bütünlüğünü yönetin."
              count={stats.products.total}
              completed={stats.products.completed}
              score={stats.products.avgScore}
            />
            <BigCard
              href="/admin/seo-killer/kategoriler"
              icon={FolderOpen}
              tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600"
              title="Kategoriler"
              subtitle="Listeleme sayfalarının taranabilir ve açıklayıcı görünmesini sağlayın."
              count={stats.categories.total}
              completed={stats.categories.completed}
              score={stats.categories.avgScore}
            />
            <BigCard
              href="/admin/seo-killer/sayfalar"
              icon={FileText}
              tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600"
              title="Sayfalar"
              subtitle="Ana sayfa ve kurumsal içeriklerde marka anlatısını güçlendirin."
              count={stats.pages.total}
              completed={stats.pages.completed}
              score={stats.pages.avgScore}
            />
          </div>
        </section>

        {(stats.products.total - stats.products.completed > 0 ||
          stats.categories.total - stats.categories.completed > 0 ||
          stats.pages.total - stats.pages.completed > 0) && (
          <section className="mt-10 rounded-[32px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#f7cfb1] bg-[#fff4ea] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
                  Öncelikli işler
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">Yapılacaklar listesi</h3>
              </div>
              <AlertCircle className="hidden h-5 w-5 text-[#C54E00] md:block" />
            </div>

            <div className="mt-6 space-y-3">
              {stats.products.total - stats.products.completed > 0 && (
                <Link
                  href="/admin/seo-killer/urunler"
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-[#f4d3c0] bg-[#fff7f1] px-5 py-4 transition-all hover:border-[#FE6100]/25 hover:bg-[#fff2e9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#ffd8b8] bg-white text-[#C54E00]">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#2f241d]">{stats.products.total - stats.products.completed} ürün için SEO alanı eksik</p>
                      <p className="text-sm text-[#8f7765]">Başlık, açıklama veya görsel desteği tamamlanmalı.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#C54E00]" />
                </Link>
              )}

              {stats.categories.total - stats.categories.completed > 0 && (
                <Link
                  href="/admin/seo-killer/kategoriler"
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-[#f0debf] bg-[#fffbf3] px-5 py-4 transition-all hover:border-amber-400/40 hover:bg-[#fff7e8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/16"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-200 bg-white text-amber-600">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#2f241d]">{stats.categories.total - stats.categories.completed} kategori için iyileştirme gerekli</p>
                      <p className="text-sm text-[#8f7765]">Kategori açıklamalarını ve başlıklarını netleştirin.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-600" />
                </Link>
              )}

              {stats.pages.total - stats.pages.completed > 0 && (
                <Link
                  href="/admin/seo-killer/sayfalar"
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-emerald-200 bg-[#f5fbf8] px-5 py-4 transition-all hover:border-emerald-400/40 hover:bg-[#eef8f2] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/16"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-emerald-200 bg-white text-emerald-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#2f241d]">{stats.pages.total - stats.pages.completed} sayfa için metin güncellemesi gerekli</p>
                      <p className="text-sm text-[#8f7765]">Kurumsal içeriklerin başlık ve açıklamalarını tamamlayın.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-emerald-600" />
                </Link>
              )}
            </div>
          </section>
        )}

        {stats.overallScore >= 80 && (
          <section className="mt-10 overflow-hidden rounded-[32px] border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-[#f4fbf6] p-8 shadow-[0_18px_45px_rgba(20,95,72,0.10)]">
            <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-sm">
                  <Star className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em] text-emerald-900">SEO yapınız güçlü görünüyor</h3>
                  <p className="mt-2 text-sm leading-6 text-emerald-800">
                    Başlık, açıklama ve görsel bütünlüğü dengeli ilerliyor. Yeni içerik eklerken aynı standardı korumanız yeterli.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
