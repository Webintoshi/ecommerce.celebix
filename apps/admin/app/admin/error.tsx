"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-600">
          Admin Hatası
        </p>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">
          Bu ekran beklenmedik şekilde durdu
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          Sayfayı sıfırlayıp tekrar deneyin. Sorun sürerse ana admin ekranına dönüp ilgili bölümü yeniden açın.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Tekrar Dene
          </button>
          <Link
            href="/admin"
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Admin Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
