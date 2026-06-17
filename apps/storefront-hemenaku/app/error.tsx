"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isChunkError =
      error.name === "ChunkLoadError" ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Importing a module script failed");

    if (isChunkError) {
      const reloaded = sessionStorage.getItem("chunk-reload");
      if (!reloaded) {
        sessionStorage.setItem("chunk-reload", "1");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem("chunk-reload");
    }

    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F7FAF9]">
      <div className="container mx-auto flex min-h-screen items-center justify-center px-4">
        <div className="max-w-2xl rounded-lg border border-[#DDE7E4] bg-white p-8 text-center shadow-sm">
          <div className="mb-8">
            <div className="mb-4 inline-flex rounded-full bg-[#FFF7ED] p-6">
              <AlertTriangle className="h-16 w-16 text-[#EA580C]" />
            </div>
          </div>

          <h1 className="mb-4 text-3xl font-bold text-[#111827] md:text-4xl">
            Sayfayi Yenileyelim
          </h1>
          <p className="mb-8 text-lg leading-8 text-[#526B66]">
            Bu sayfa beklenmedik sekilde yuklenemedi. Yeniden deneyebilir veya
            Hemenaku ana sayfasina donebilirsiniz.
          </p>

          {process.env.NODE_ENV === "development" ? (
            <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-left">
              <p className="break-all text-sm font-mono text-red-800">{error.message}</p>
            </div>
          ) : null}

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-6 py-3 font-medium text-white transition-colors hover:bg-[#115E59]"
            >
              <RefreshCw className="h-5 w-5" />
              Tekrar Dene
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DDE7E4] px-6 py-3 font-medium text-[#111827] transition-colors hover:bg-[#F7FAF9]"
            >
              <Home className="h-5 w-5" />
              Ana Sayfaya Don
            </Link>
          </div>

          <div className="mt-12 border-t border-gray-200 pt-8">
            <p className="mb-4 text-gray-600">
              Sorun devam ediyorsa lutfen bizimle iletisime gecin:
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href={`mailto:${STOREFRONT_RUNTIME.supportEmail}`}
                className="font-medium text-primary hover:underline"
              >
                {STOREFRONT_RUNTIME.supportEmail}
              </a>
              <span className="hidden text-gray-400 sm:inline">|</span>
              <a
                href={`tel:${STOREFRONT_RUNTIME.supportPhone.replace(/\s+/g, "")}`}
                className="font-medium text-primary hover:underline"
              >
                {STOREFRONT_RUNTIME.supportPhone}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
