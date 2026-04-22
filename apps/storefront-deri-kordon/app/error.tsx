"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";
import {
  attemptAutoRecovery,
  shouldAutoRecover,
} from "@/lib/error-recovery";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (shouldAutoRecover(error)) {
      const recovered = attemptAutoRecovery(error);
      if (recovered) {
        return;
      }
    }

    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
      <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
        <h1 className="text-7xl sm:text-8xl font-medium text-neutral-200 mb-6 tracking-tight">
          !
        </h1>

        <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-4 tracking-tight">
          Bir Hata Oluştu
        </h2>
        <p className="text-base text-neutral-500 mb-10 leading-relaxed max-w-md mx-auto">
          Üzgünüz, sayfa geçişi sırasında bir sorun oluştu. Lütfen sayfayı
          yenilemeyi deneyin veya ana sayfaya dönün.
        </p>

        {process.env.NODE_ENV === "development" && (
          <div className="mb-8 p-4 bg-white border border-neutral-200 rounded-xl text-left">
            <p className="text-sm font-mono text-neutral-700 break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-neutral-900 border border-neutral-200 rounded-xl font-medium hover:bg-neutral-50 transition-colors"
          >
            <Home className="w-4 h-4" />
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
