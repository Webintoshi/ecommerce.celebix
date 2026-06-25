"use client";

import { Globe2 } from "lucide-react";
import { TranslationSettingsPanel } from "@/components/admin/TranslationSettingsPanel";

export default function LanguageSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-900 text-white">
                <Globe2 className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dil Ayarları</h1>
            </div>
          </div>
        </div>

        <TranslationSettingsPanel />
      </div>
    </div>
  );
}
