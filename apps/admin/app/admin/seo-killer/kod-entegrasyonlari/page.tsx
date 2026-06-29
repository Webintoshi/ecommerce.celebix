"use client";

import { CodeIntegrationsSettingsPanel } from "@/components/admin/CodeIntegrationsSettingsPanel";

export default function CodeIntegrationsPage() {
  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-none">
        <CodeIntegrationsSettingsPanel />
      </div>
    </main>
  );
}
