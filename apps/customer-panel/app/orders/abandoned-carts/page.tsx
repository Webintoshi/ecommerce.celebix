import { AbandonedCartConsole } from "@/components/orders/AbandonedCartConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";
export default async function AbandonedCartsPage() { const access = await requireServerPanelAccess(); return <PanelShell model={createPanelChromeModel(access.tenantContext)}><AbandonedCartConsole /></PanelShell>; }
