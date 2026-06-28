"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Globe, Info, Key, Send, Zap } from "lucide-react";
import { generateIndexNowKey, pingSearchEngines, submitToIndexNow } from "@/lib/indexing-service";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export default function FastIndexingPage() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("a1b2c3d4e5f6g7h8");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ provider: string; success: boolean; message: string }[]>([]);
  const defaultHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const generateNewKey = () => {
    setApiKey(generateIndexNowKey());
  };

  const handleIndexNow = async () => {
    if (!url) return;
    setLoading(true);
    setResults([]);

    let host = defaultHost;
    try {
      const urlObj = new URL(url);
      host = urlObj.hostname;
    } catch {
      // Fallback
    }

    setTimeout(async () => {
      const res = await submitToIndexNow(url, apiKey, host);
      setResults(res);
      setLoading(false);
    }, 1500);
  };

  const handlePing = async () => {
    setLoading(true);
    setResults([]);
    const sitemap = `${STORE_RUNTIME.storefrontUrl}/sitemap.xml`;

    setTimeout(async () => {
      const res = await pingSearchEngines(sitemap);
      setResults(res);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="admin-page-root text-[var(--admin-heading)]">
      <div className="mx-auto max-w-none space-y-8 px-6 py-8 md:px-8 md:py-10">
        <section className="relative overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white p-8 shadow-[var(--shadow-xs)] md:p-10">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Hızlı indeksleme
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[var(--shadow-xs)]">
                  <Zap className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Hızlı İndeks Yöneticisi</h1>
                  <p className="mt-3 text-sm leading-7 text-[#7f6858] md:text-base">
                    Yeni içerikleri arama motorlarına daha hızlı bildirmeniz için IndexNow ve sitemap ping akışlarını tek yönetim yüzeyinde toplayın.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-[var(--admin-border)] bg-[#2f241d] p-5 text-white shadow-[var(--shadow-xs)]">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                İş akışı önerisi
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">Tek URL için IndexNow, toplu güncelleme için sitemap ping</p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#ead9c9]">Büyük içerik yayını sonrasında ping, ürün veya sayfa bazlı değişikliklerde ise IndexNow daha kontrollü ilerler.</p>
            </div>
          </div>
          <div className="hidden" />
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                  Anlık bildirim
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#d6e4ff] bg-[#eff6ff] text-blue-600">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">IndexNow</h2>
                    <p className="text-sm text-[#8f7765]">Bing ve Yandex için tekil URL bildirimi.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#5c4a3e]">İndekslenecek URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={`${STORE_RUNTIME.storefrontUrl}/urunler/yeni-urun`}
                  className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 font-mono text-sm text-[var(--admin-heading)] outline-none transition-all placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.12)]"
                />
              </div>

              <div className="rounded-[12px] border border-[#f0e3d7] bg-[#fcf8f3] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d836f]">API key</label>
                  <button
                    onClick={generateNewKey}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-accent-hover)] transition-colors hover:text-[#9f4300] focus-visible:outline-none"
                  >
                    <Key className="h-3.5 w-3.5" />
                    Yenile
                  </button>
                </div>
                <div className="rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 font-mono text-xs text-[#5b473b] break-all">
                  {apiKey}
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-[18px] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <p>
                    Bu anahtarı içeren bir metin dosyasını sunucunun kök dizinine <strong>{apiKey}.txt</strong> olarak yüklemeniz gerekir.
                  </p>
                </div>
              </div>

              <button
                onClick={handleIndexNow}
                disabled={!url || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-xs)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Send className="h-4 w-4" />
                {loading ? "Gönderiliyor..." : "Bing ve Yandex'e bildir"}
              </button>
            </div>
          </section>

          <section className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
            <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
              Toplu sinyal
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-600">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em]">Sitemap ping</h2>
                <p className="text-sm text-[#8f7765]">Google ve diğer motorlara güncelleme sinyali gönderin.</p>
              </div>
            </div>

            <div className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              <strong>Not:</strong> Bu işlem tüm sitemap yapısını yeniden taratmayı hedefler. Çok sık çalıştırmak yerine büyük içerik güncellemelerinden sonra kullanmak daha dengelidir.
            </div>

            <div className="mt-5 rounded-[12px] border border-[#f0e3d7] bg-[#fcf8f3] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d836f]">Varsayılan sitemap</div>
              <div className="mt-3 rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 font-mono text-xs text-[#5b473b] break-all">
                {STORE_RUNTIME.storefrontUrl}/sitemap.xml
              </div>
            </div>

            <button
              onClick={handlePing}
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(5,150,105,0.18)] transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/18"
            >
              <Globe className="h-4 w-4" />
              {loading ? "Sinyal gönderiliyor..." : "Google ve Bing'e ping at"}
            </button>
          </section>
        </div>

        <section className="rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[0_18px_45px_rgba(105,78,54,0.08)] overflow-hidden">
          <div className="border-b border-[#f0e3d7] bg-[#fcf8f3] px-6 py-5 md:px-8">
            <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
              İşlem sonuçları
            </div>
          </div>

          {results.length > 0 ? (
            <div className="divide-y divide-[#f1e5d9]">
              {results.map((res, idx) => (
                <div key={idx} className="flex items-start gap-4 px-6 py-5 md:px-8">
                  <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ${res.success ? "border border-emerald-200 bg-emerald-50 text-emerald-600" : "border border-red-200 bg-red-50 text-red-600"}`}>
                    {res.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--admin-heading)]">{res.provider}</p>
                    <p className="mt-1 text-sm leading-6 text-[#7f6858]">{res.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center md:px-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--admin-border)] bg-[#FCFDFE] text-[var(--admin-accent-hover)]">
                <Zap className="h-7 w-7" />
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">Henüz işlem sonucu yok</p>
              <p className="mt-2 text-sm text-[#8f7765]">Bir URL bildirimi veya sitemap ping işlemi başlattığınızda sonuçlar burada listelenir.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
