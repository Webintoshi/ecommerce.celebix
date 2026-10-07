"use client";

import { useMemo, useState } from "react";
import type { GoogleMarketingConnection, GoogleMarketingOverview, GoogleMarketingResources, GoogleMarketingService } from "@celebix/saas-contracts";
import { GoogleMarketingConnections } from "@/components/google-marketing/GoogleMarketingConnections";
import { GoogleMarketingApiError, type GoogleMarketingClient } from "@/components/google-marketing/client";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { MODEL } from "../../mira-catalog/catalog-fixture";

/** Disposable DTOs exercise the actual UI. These are never real Google accounts or OAuth acceptance. */
function fixtureClient(scenario: string): GoogleMarketingClient {
  const email = "google-qa@example.test";
  const domain = "mira-butik.example";
  const blank = (service: GoogleMarketingService): GoogleMarketingConnection => ({ service, version: 0, status: "disconnected", googleEmail: scenario === "unconnected" ? null : email, selection: null, lastCheckedAt: null, errorCode: null });
  let connections: GoogleMarketingConnection[] = scenario === "unconnected" ? [blank("gtm"), blank("ads"), blank("search_console")] : [
    { ...blank("gtm"), version: 3, status: scenario === "reconnect" ? "needs_reconnect" : "connected", selection: { accountId: "101", resourceId: "201", resourceName: "Mira Butik · Web", tagId: "GTM-QATEST1" } },
    blank("ads"),
    { ...blank("search_console"), version: 1, status: "connected", selection: { accountId: "site", resourceId: `https://${domain}/`, resourceName: domain } },
  ];
  const completed = new Map<string, GoogleMarketingConnection>();
  let firstSave = true;
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, scenario === "loading" ? 3000 : 120));
  return {
    async overview(): Promise<GoogleMarketingOverview> {
      await wait();
      if (scenario === "error") throw new GoogleMarketingApiError("unavailable");
      return structuredClone({ storeDomain: domain, oauthConfigured: scenario !== "unconfigured", connections });
    },
    async connect() { await wait(); return { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?fixture=true" }; },
    async resources(service, accountId): Promise<GoogleMarketingResources> {
      await wait();
      const accounts = service === "gtm" ? [{ id: "101", name: "Mira Butik" }, { id: "102", name: "Mağaza Ajansı" }] : service === "ads" ? [{ id: "1234567890", name: "Mira Butik reklam hesabı" }] : [{ id: "site", name: "Search Console" }];
      if (!accountId) return { accounts, resources: [] };
      const resources = service === "gtm" ? [{ id: "201", name: "Mira Butik · Web", parentId: accountId, tagId: "GTM-QATEST1" }, { id: "202", name: "Mira Butik · Yeni konteyner", parentId: accountId, tagId: "GTM-QATEST2" }] : service === "ads" ? [{ id: "301", name: "Web satın alma", parentId: accountId, tagId: "AW-1234567890", conversionLabel: "qa_purchase_label" }] : [{ id: `https://${domain}/`, name: domain, parentId: "site" }];
      return { accounts, resources: scenario === "empty" ? [] : resources };
    },
    async apply(input, operationId) {
      await wait();
      const replay = completed.get(operationId);
      if (replay) return structuredClone(replay);
      if (scenario === "save-error" && firstSave) { firstSave = false; throw new GoogleMarketingApiError("provider_unavailable"); }
      if (scenario === "conflict" && firstSave) { firstSave = false; throw new GoogleMarketingApiError("version_conflict", 409); }
      const current = connections.find(item => item.service === input.service)!;
      const next: GoogleMarketingConnection = { ...current, version: current.version + 1, status: "connected", selection: input.selection.create && input.service === "gtm" ? { accountId: input.selection.accountId, resourceId: "203", resourceName: `Celebix ${domain}`, tagId: "GTM-QATEST3" } : { ...input.selection, create: false }, lastCheckedAt: new Date().toISOString(), errorCode: null };
      connections = connections.map(item => item.service === next.service ? next : item);
      completed.set(operationId, next);
      return structuredClone(next);
    },
    async disconnect(input, operationId) {
      await wait();
      const replay = completed.get(operationId);
      if (replay) return structuredClone(replay);
      const current = connections.find(item => item.service === input.service)!;
      const next: GoogleMarketingConnection = { ...blank(input.service), googleEmail: null, version: current.version + 1 };
      connections = connections.map(item => item.service === next.service ? next : item);
      completed.set(operationId, next);
      return structuredClone(next);
    },
  };
}

export function GoogleMarketingFixtureScreen({ scenario }: { scenario: string }) {
  const client = useMemo(() => fixtureClient(scenario), [scenario]);
  const [oauthNotice, setOauthNotice] = useState("");
  return <PanelLayoutClient model={{ ...MODEL, storeSlug: "google-marketing-qa", storefrontHostname: "mira-butik.example", membershipLabel: "QA fixture · canlı Google bağlantısı değil" }}>
    <PanelWorkspaceShell title="Google Bağlantıları" tabs={MARKETING_WORKSPACE_TABS}>
      <p data-google-qa-fixture="true" style={{ fontSize: 12, color: "var(--cp-text-secondary)", margin: "0 0 16px" }}>QA fixture · Google hesapları ve sonuçları örnektir.</p>
      {oauthNotice ? <p role="status">{oauthNotice}</p> : null}
      <GoogleMarketingConnections canManage={scenario !== "readonly"} client={client} onAuthorize={() => setOauthNotice("QA fixture: Google yönlendirmesi yakalandı; gerçek yetkilendirme yapılmadı.")} />
    </PanelWorkspaceShell>
  </PanelLayoutClient>;
}
