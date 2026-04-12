"use client";

import {
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode,
  History,
  Shield,
} from "lucide-react";
import { buildStorefrontUrl, STORE_RUNTIME } from "@/lib/store-runtime";

const blockedPaths = ["/admin/", "/api/", "/giris/", "/kayit/", "/sepet/", "/odeme/"];

function LinkPanel({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center justify-between gap-3 rounded-[22px] border border-[#eadccd] bg-white px-4 py-4 transition-all hover:border-[#FE6100]/20 hover:bg-[#fff9f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d836f]">{label}</p>
        <p className="mt-2 truncate font-mono text-xs text-[#6f594c] md:text-sm">{href}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#eadccd] bg-[#fffaf5] text-[#8a6f5d] transition-colors group-hover:text-[#C54E00]">
        <ExternalLink className="h-4 w-4" />
      </div>
    </a>
  );
}

export default function SitemapManagerPage() {
  const sitemapUrl = buildStorefrontUrl("/sitemap.xml");
  const sitemapProductsUrl = buildStorefrontUrl("/sitemap-products.xml");
  const sitemapPagesUrl = buildStorefrontUrl("/sitemap-pages.xml");
  const sitemapCollectionsUrl = buildStorefrontUrl("/sitemap-collections.xml");
  const robotsUrl = buildStorefrontUrl("/robots.txt");

  return (
    <div className="min-h-screen bg-[#f6efe8] text-[#2f241d]">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8 md:py-10">
        <section className="relative overflow-hidden rounded-[34px] border border-[#eadccd] bg-gradient-to-br from-[#fff8f2] via-white to-[#f8eee5] p-8 shadow-[0_22px_70px_rgba(99,67,37,0.10)] md:p-10">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Sitemap kontrolü
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[#ffd7b8] bg-gradient-to-br from-[#FE6100] to-[#d97706] text-white shadow-[0_22px_50px_rgba(254,97,0,0.22)]">
                  <FileCode className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Sitemap Yöneticisi</h1>
                  <p className="mt-3 text-sm leading-7 text-[#7f6858] md:text-base">
                    Site haritaları ve robots.txt akışını mağazanızın gerçek storefront alan adı üzerinden izleyin, paylaşın ve doğrulayın.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#eadccd] bg-white/90 p-5 shadow-[0_16px_40px_rgba(99,67,37,0.08)]">
              <div className="flex items-center gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Aktif ve erişilebilir</p>
                  <p className="text-sm text-emerald-700">Son güncelleme: {new Date().toLocaleDateString("tr-TR")} · otomatik</p>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/12 blur-3xl" />
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                  Canlı bağlantılar
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Sitemap kaynakları</h2>
              </div>
              <a
                href={sitemapUrl}
                download
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                <Download className="h-4 w-4" />
                İndir
              </a>
            </div>

            <div className="mt-6 rounded-[26px] border border-[#f0e3d7] bg-[#fcf8f3] p-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#9d836f]">
                Sitemap index
              </label>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  readOnly
                  value={sitemapUrl}
                  className="min-w-0 flex-1 rounded-2xl border border-[#e8d9cb] bg-white px-4 py-3 font-mono text-sm text-[#5b473b] outline-none"
                />
                <a
                  href={sitemapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                >
                  <ExternalLink className="h-4 w-4" />
                  Aç
                </a>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <LinkPanel label="Ürünler" href={sitemapProductsUrl} />
              <LinkPanel label="Sayfalar" href={sitemapPagesUrl} />
              <LinkPanel label="Koleksiyonlar" href={sitemapCollectionsUrl} />
            </div>

            <div className="mt-6 rounded-[26px] border border-[#eadccd] bg-white p-5">
              <p className="text-sm leading-7 text-[#7f6858]">
                Sitemap dosyaları Next.js tarafında <strong>dinamik olarak</strong> üretilir. Ürün, kategori veya sayfa güncellendiğinde storefront sitemap yapısı da gerçek domain üzerinden anında yansır.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)]">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                İçerik özeti
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#e8ddd3] bg-[#fcf8f3] text-[#8a6f5d]">
                  <History className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold tracking-[-0.03em]">Şu anda neler kapsanıyor?</h2>
              </div>

              <div className="mt-5 space-y-3">
                {["Ana sayfa", "Kurumsal sayfalar (Hakkımızda, İletişim vb.)", "Tüm ürün sayfaları", "Tüm kategori sayfaları", "Blog yazıları (varsa)"]
                  .map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-[20px] border border-[#f1e5d9] bg-[#fdf8f3] px-4 py-3 text-sm text-[#6f594c]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FE6100]" />
                      {item}
                    </div>
                  ))}
              </div>

              <div className="mt-6 rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                <h3 className="text-sm font-semibold text-blue-900">Google Search Console notu</h3>
                <p className="mt-2 text-sm leading-6 text-blue-800">
                  Eklenmesi gereken adres her zaman <span className="font-semibold">{STORE_RUNTIME.storefrontUrl}</span> tabanlı sitemap URL'sidir; admin alan adı kullanılmamalıdır.
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-[#eadccd] bg-[#2f241d] p-6 text-white shadow-[0_22px_60px_rgba(47,36,29,0.20)]">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                Robots.txt
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">Storefront tarafında dinamik olarak yayınlanır</p>
              <a
                href={robotsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#3d2b1f] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
              >
                <ExternalLink className="h-4 w-4" />
                {robotsUrl}
              </a>
            </div>
          </section>
        </div>

        <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Bot yönetimi
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">AI bot kontrolü</h2>
            </div>
            <Bot className="hidden h-5 w-5 text-[#C54E00] md:block" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-white text-emerald-600">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-900">Koruma durumu</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-emerald-800">
                Robots.txt dosyası 15+ AI botu için yapılandırılmış durumda. Crawl-delay ve dizin kısıtları aktif.
              </p>
            </div>

            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-white text-amber-600">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-900">Yönetilen botlar</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-amber-800">
                GPTBot, ClaudeBot, PerplexityBot, Google-Extended ve benzeri botlar için özel kurallar tanımlıdır.
              </p>
            </div>

            <div className="rounded-[24px] border border-[#f5d2bc] bg-[#fff4ea] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-white text-[#C54E00]">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8c4317]">Yayın kaynağı</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#8c4317]">Robots.txt dosyası storefront alan adı üzerinden dinamik olarak üretilir.</p>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-[#f0e3d7] bg-[#fcf8f3] p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8e7664]">Engellenen dizinler</h4>
            <div className="mt-4 flex flex-wrap gap-2">
              {blockedPaths.map((path) => (
                <span key={path} className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-mono text-xs font-medium text-red-700">
                  {path}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#8a7261]">
            Not: Robots.txt gönüllü uyum esasına dayanır. Kötü niyetli botlar için ek WAF ve rate limit önlemleri gerekebilir.
          </p>
        </section>
      </div>
    </div>
  );
}
