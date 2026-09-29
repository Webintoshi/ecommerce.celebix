import { notFound } from "next/navigation";
import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { MerchantMarketingOverview } from "@/components/merchant-admin/MerchantMarketingOverview";
import { MerchantFamilyOverview } from "@/components/merchant-admin/MerchantFamilyOverview";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MERCHANT_MODULE_DEFINITIONS } from "@/lib/merchant-admin-ui/presentation";
import { CONTENT_WORKSPACE_TABS, MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { MODEL } from "../../mira-catalog/catalog-fixture";

// Isolated local QA application. No production route, authentication or tenant path.
export default async function MerchantFixture({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ view?: string; permission?: string }> }) {
  const [{ kind }, query] = await Promise.all([params, searchParams]);
  const canManage = query.permission !== "read";
  let page;
  if (kind === "marketing") page = <PanelWorkspaceShell title="Pazarlama" tabs={MARKETING_WORKSPACE_TABS}><MerchantMarketingOverview embedded canManage={canManage} /></PanelWorkspaceShell>;
  else if (kind === "content") page = <PanelWorkspaceShell title="İçerik" tabs={CONTENT_WORKSPACE_TABS}><MerchantFamilyOverview embedded family="content" canManage={canManage} /></PanelWorkspaceShell>;
  else {
    const definition = MERCHANT_MODULE_DEFINITIONS.find(item => item.kind === kind && item.family !== "settings" && item.kind !== "policy");
    if (!definition) notFound();
    page = query.view === "new" || query.view === "edit" ? <MerchantRecordEditor kind={definition.kind} canManage={canManage} returnTo={`/mira-merchant/${kind}`} recordId={query.view === "edit" ? "71000000-0000-4000-8000-000000000001" : undefined} /> : <MerchantModuleConsole kind={definition.kind} canManage={canManage} />;
  }
  return <PanelLayoutClient model={MODEL}><div data-evidence="isolated-merchant-fixture">{page}</div></PanelLayoutClient>;
}
