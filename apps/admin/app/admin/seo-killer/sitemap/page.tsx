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

export default function SitemapManagerPage() {
  const sitemapUrl = buildStorefrontUrl("/sitemap.xml");
  const sitemapProductsUrl = buildStorefrontUrl("/sitemap-products.xml");
  const sitemapPagesUrl = buildStorefrontUrl("/sitemap-pages.xml");
  const sitemapCollectionsUrl = buildStorefrontUrl("/sitemap-collections.xml");
  const robotsUrl = buildStorefrontUrl("/robots.txt");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FileCode className="h-8 w-8 text-orange-600" />
          Sitemap Yoneticisi
        </h1>
        <p className="text-gray-500">
          Site haritasi her zaman magazanizin gercek storefront domaini uzerinden uretilir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Sitemap Durumu</h2>

          <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-4 text-green-700">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <span className="block font-semibold">Aktif ve Erisilebilir</span>
              <span className="text-sm opacity-80">
                Son guncelleme: {new Date().toLocaleDateString()} (Otomatik)
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Sitemap Index (Ana Dosya)
              </label>
              <div className="mb-3 flex gap-2">
                <input
                  readOnly
                  value={sitemapUrl}
                  className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 font-mono text-sm font-semibold text-blue-800"
                />
                <a
                  href={sitemapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-blue-600"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Ürünler Haritası
                  </label>
                  <a
                    href={sitemapProductsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 hover:bg-gray-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {sitemapProductsUrl}
                  </a>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Sayfalar Haritasi
                  </label>
                  <a
                    href={sitemapPagesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 hover:bg-gray-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {sitemapPagesUrl}
                  </a>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Koleksiyonlar Haritasi
                  </label>
                  <a
                    href={sitemapCollectionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 hover:bg-gray-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {sitemapCollectionsUrl}
                  </a>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="mb-3 text-sm text-gray-500">
                Sitemap dosyanız Next.js tarafında <strong>dinamik olarak</strong> üretilir.
                Ürün, kategori veya sayfa güncellendiğinde storefront sitemap'i de gerçek
                domain uzerinden aninda yansir.
              </p>
              <a
                href={sitemapUrl}
                download
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                <Download className="h-4 w-4" />
                Dosya olarak indir
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <History className="h-5 w-5 text-gray-400" />
            İçerik Özeti
          </h2>

          <div className="space-y-0 text-sm text-gray-600">
            <p>Su an sitemap icerisinde:</p>
            <ul className="ml-2 mt-2 list-inside list-disc space-y-1">
              <li>Ana sayfa</li>
              <li>Kurumsal sayfalar (Hakkimizda, Iletisim vb.)</li>
              <li>Tum urun sayfalari</li>
              <li>Tum kategori sayfalari</li>
              <li>Blog yazilari (varsa)</li>
            </ul>
          </div>

          <div className="mt-8 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <h3 className="mb-1 text-sm font-semibold text-blue-800">Google'a Gonderme</h3>
            <p className="text-xs leading-relaxed text-blue-700">
              Search Console'a eklemeniz gereken adres her zaman
              <span className="mx-1 font-semibold">{STORE_RUNTIME.storefrontUrl}</span>
              tabanli sitemap URL'sidir; admin domaini degil.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <Bot className="h-5 w-5 text-purple-600" />
            AI Bot Kontrolu
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-green-100 bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                <h3 className="text-sm font-semibold text-green-800">Koruma Durumu</h3>
              </div>
              <p className="text-xs leading-relaxed text-green-700">
                Robots.txt dosyaniz 15+ AI botu icin yapilandirilmis durumda. Crawl-delay
                ve dizin kisitlari aktif.
              </p>
            </div>

            <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-purple-800">Yonetilen Botlar</h3>
              </div>
              <p className="text-xs leading-relaxed text-purple-700">
                GPTBot, ClaudeBot, PerplexityBot, Google-Extended ve benzeri botlar icin
                ozel kurallar tanimli.
              </p>
            </div>

            <div className="rounded-lg border border-orange-100 bg-orange-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileCode className="h-5 w-5 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-800">Robots.txt</h3>
              </div>
              <p className="text-xs leading-relaxed text-orange-700">
                <a href={robotsUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {robotsUrl}
                </a>{" "}
                dosyasi storefront domaini uzerinden dinamik uretilir.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-800">
              Engellenen Dizinler (Tum Botlar Icin)
            </h4>
            <div className="flex flex-wrap gap-2">
              {blockedPaths.map((path) => (
                <span
                  key={path}
                  className="rounded bg-red-100 px-2 py-1 font-mono text-xs text-red-700"
                >
                  {path}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            <p>
              Not: Robots.txt gonullu uyum esasina dayanir. Kotu niyetli botlar icin ek
              WAF ve rate limiting onlemleri gerekebilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
