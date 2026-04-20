"use client";

import { CheckCircle2, Download, ExternalLink, FileCode } from "lucide-react";
import { buildStorefrontUrl, STORE_RUNTIME } from "@/lib/store-runtime";

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
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#eadccd] bg-white/90 p-5 shadow-[0_16px_40px_rgba(99,67,37,0.08)]">
              <div className="flex items-center gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Aktif ve erişilebilir</p>
                  <p className="text-sm text-emerald-700">
                    Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
                  </p>
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
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)]">
              <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                <h3 className="text-sm font-semibold text-blue-900">Google Search Console</h3>
                <p className="mt-2 text-sm leading-6 text-blue-800">
                  Eklenecek adres <span className="font-semibold">{STORE_RUNTIME.storefrontUrl}</span> tabanlı sitemap
                  URL’si olmalıdır; admin alan adı kullanılmamalıdır.
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-[#eadccd] bg-[#2f241d] p-6 text-white shadow-[0_22px_60px_rgba(47,36,29,0.20)]">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                Robots.txt
              </div>
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
      </div>
    </div>
  );
}
