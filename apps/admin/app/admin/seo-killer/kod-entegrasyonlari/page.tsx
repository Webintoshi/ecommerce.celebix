"use client";

import Link from "next/link";
import { ChevronLeft, Code2 } from "lucide-react";
import { CodeIntegrationsSettingsPanel } from "@/components/admin/CodeIntegrationsSettingsPanel";

export default function CodeIntegrationsPage() {
  return (
    <div className="admin-page-root p-6 md:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/admin/seo-killer"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--admin-text-secondary)] transition hover:text-[var(--admin-heading)]"
          >
            <ChevronLeft className="h-4 w-4" />
            SEO araclarina don
          </Link>

          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2f241d] text-white">
                <Code2 className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--admin-heading)]">
                Kod Entegrasyonlari
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-[#7f6858]">
                Google Tag Manager, Search Console, Meta Pixel ve site genelinde
                calisacak ek kodlari bu ekrandan yonetin.
              </p>
            </div>
          </div>
        </div>

        <CodeIntegrationsSettingsPanel />
      </div>
    </div>
  );
}
