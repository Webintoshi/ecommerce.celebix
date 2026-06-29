"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Globe, Key, Send, Zap } from "lucide-react";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
import { generateIndexNowKey, pingSearchEngines, submitToIndexNow } from "@/lib/indexing-service";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";

type IndexResult = {
  provider: string;
  success: boolean;
  message: string;
};

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

function ResultRow({ result }: { result: IndexResult }) {
  return (
    <div className="grid gap-3 px-4 py-3 min-[760px]:grid-cols-[180px_110px_minmax(0,1fr)] min-[760px]:items-center">
      <span className="text-sm font-semibold text-[#182232]">{result.provider}</span>
      <span
        className={cn(
          "w-fit rounded-[8px] border px-2.5 py-1 text-xs font-semibold",
          result.success
            ? "border-[#BFE8CE] bg-[#EAF8EF] text-[#16A34A]"
            : "border-[#FECACA] bg-[#FDECEC] text-[#EF4444]",
        )}
      >
        {result.success ? "Başarılı" : "Hata"}
      </span>
      <span className="text-sm leading-6 text-[#667085]">{result.message}</span>
    </div>
  );
}

const FIELD_CLASS =
  "w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

export default function FastIndexingPage() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("a1b2c3d4e5f6g7h8");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<IndexResult[]>([]);
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
      // Host fallback keeps the previous behavior for partial URLs.
    }

    setTimeout(async () => {
      const response = await submitToIndexNow(url, apiKey, host);
      setResults(response);
      setLoading(false);
    }, 1500);
  };

  const handlePing = async () => {
    setLoading(true);
    setResults([]);
    const sitemap = `${STORE_RUNTIME.storefrontUrl}/sitemap.xml`;

    setTimeout(async () => {
      const response = await pingSearchEngines(sitemap);
      setResults(response);
      setLoading(false);
    }, 1000);
  };

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="SEO"
          title="Hızlı indeks"
          description="IndexNow ve sitemap ping işlemlerini yönetin."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AdminActionButton type="button" disabled={!url || loading} onClick={() => void handleIndexNow()} tone="primary">
                <Send className="h-4 w-4" />
                URL Bildir
              </AdminActionButton>
              <AdminActionButton type="button" disabled={loading} onClick={() => void handlePing()}>
                <Globe className={cn("h-4 w-4", loading && "animate-spin")} />
                Sitemap Ping
              </AdminActionButton>
            </div>
          }
          metrics={
            <>
              <MetricCell label="Host" value={defaultHost ? "Var" : "Yok"} context="vitrin" />
              <MetricCell label="URL" value={url ? "Hazır" : "Boş"} context="bildirim" />
              <MetricCell label="Sonuç" value={String(results.length)} context="kayıt" />
              <MetricCell label="Key" value={apiKey ? "Var" : "Yok"} context="IndexNow" />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(380px,0.7fr)]">
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#182232]">IndexNow</h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#374151]">İndekslenecek URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={`${STORE_RUNTIME.storefrontUrl}/urunler/yeni-urun`}
                  className={cn(FIELD_CLASS, "font-mono")}
                />
              </div>

              <div className="rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7D8795]">API key</span>
                  <button
                    type="button"
                    onClick={generateNewKey}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-[#DCE3EC] bg-white px-2.5 py-1 text-xs font-semibold text-[#4B5563] transition hover:border-[#FFC7A8] hover:text-[#E85D04]"
                  >
                    <Key className="h-3.5 w-3.5" />
                    Yenile
                  </button>
                </div>
                <div className="break-all rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-2 font-mono text-xs text-[#374151]">
                  {apiKey}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#182232]">Sitemap ping</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7D8795]">Varsayılan sitemap</p>
                <p className="mt-2 break-all font-mono text-xs text-[#374151]">
                  {STORE_RUNTIME.storefrontUrl}/sitemap.xml
                </p>
              </div>
              <div className="rounded-[10px] border border-[#FFC7A8] bg-[#FFF4EC] p-3 text-sm leading-6 text-[#C24D00]">
                Büyük içerik güncellemelerinden sonra kullanın.
              </div>
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
          <div className="grid grid-cols-[180px_110px_minmax(0,1fr)] border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563] max-[759px]:hidden">
            <span>Sağlayıcı</span>
            <span>Durum</span>
            <span>Mesaj</span>
          </div>
          {results.length > 0 ? (
            <div className="divide-y divide-[#E3E9F0]">
              {results.map((result) => (
                <ResultRow key={`${result.provider}-${result.message}`} result={result} />
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={<Zap className="h-6 w-6" />}
              title="Henüz işlem sonucu yok"
              description="URL bildirimi veya sitemap ping sonrası sonuçlar burada görünür."
              className="rounded-none border-0 bg-white"
            />
          )}
        </section>

        {loading ? (
          <div className="rounded-[12px] border border-[#FFC7A8] bg-[#FFF4EC] px-4 py-3 text-sm font-semibold text-[#C24D00]">
            <AlertCircle className="mr-2 inline h-4 w-4 align-[-2px]" />
            İşlem devam ediyor.
          </div>
        ) : results.some((result) => result.success) ? (
          <div className="rounded-[12px] border border-[#BFE8CE] bg-[#EAF8EF] px-4 py-3 text-sm font-semibold text-[#16A34A]">
            <CheckCircle2 className="mr-2 inline h-4 w-4 align-[-2px]" />
            En az bir sağlayıcı başarılı döndü.
          </div>
        ) : null}
      </AdminPageShell>
    </main>
  );
}
