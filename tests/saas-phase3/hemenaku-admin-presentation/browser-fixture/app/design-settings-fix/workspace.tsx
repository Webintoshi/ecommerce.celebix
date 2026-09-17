"use client";
import { useState } from "react";
import Link from "next/link";
import type { StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import type { StorefrontDesignPreviewResources } from "../../../../../../apps/customer-panel/lib/storefront-design-preview-model";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { DesignWorkspace } from "@/components/settings/design/DesignWorkspace";
import "@celebix/storefront-design-ui/styles.css";

const model = { analyticsAvailable: false, storeSlug: "isolated-design-qa", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 3, entitlementStatus: "active" as const, storefrontHostname: "fixture.invalid", locale: "tr-TR" };
export function DesignFixFixture({ workspace, initialPreviewResources }: { workspace: StorefrontDesignWorkspace; initialPreviewResources: StorefrontDesignPreviewResources }) {
  const [notice, setNotice] = useState("İZOLE FIXTURE · Dosyaya kalıcılık · Canlı bağlantı yok");
  async function control(action: string) {
    const response = await fetch("/api/design-settings-fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    setNotice(response.ok ? `İzole test: ${action}` : "Fixture kontrol hatası");
  }
  return <PanelLayoutClient model={model}>
    <aside style={{ padding: 8, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="İzole test denetimleri">
      <span>{notice}</span>
      <button type="button" onClick={() => void control("fail-next-save")}>Sonraki kaydı reddet</button>
      <button type="button" onClick={() => void control("remote-edit")}>Başka oturum değişikliği</button>
      <button type="button" onClick={() => void control("hold-next-save")}>Sonraki kaydı beklet</button>
      <button type="button" onClick={() => void control("release-save")}>Bekleyen kaydı sürdür</button>
      <a href="/design-settings-fix">Kaydı yeniden oku</a>
      <Link href="/design-settings-history">İzole geçmiş sayfası</Link>
    </aside>
    <DesignWorkspace workspace={workspace} initialPreviewResources={initialPreviewResources} canManage recoveryScope="isolated-design-qa-session-store" />
  </PanelLayoutClient>;
}
