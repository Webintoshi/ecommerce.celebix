import type { TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel, type PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { resolvePanelAnalyticsAvailability } from "@/lib/server-analytics/availability";
import { resolveDefaultPanelStoreOptions } from "@/lib/panel-store-options/default";
import { PanelLayoutClient } from "./PanelLayoutClient";

const SERVER_CONTEXT_PROP = "tenant\u0043ontext" as const;

type PanelShellProps =
  | { children: React.ReactNode; model: PanelChromeModel; [SERVER_CONTEXT_PROP]?: never }
  | { children: React.ReactNode; model?: never; [SERVER_CONTEXT_PROP]: TenantContext };

export async function PanelShell(props: PanelShellProps) {
  const entitledModel = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  const analyticsAvailable = props[SERVER_CONTEXT_PROP]
    ? await resolvePanelAnalyticsAvailability(props[SERVER_CONTEXT_PROP])
    : false;
  const storeOptions = props[SERVER_CONTEXT_PROP]
    ? await resolveDefaultPanelStoreOptions(props[SERVER_CONTEXT_PROP].store.id)
    : undefined;
  const model = Object.freeze({
    ...entitledModel,
    analyticsAvailable,
    ...(props[SERVER_CONTEXT_PROP] ? {
      activeStoreId: props[SERVER_CONTEXT_PROP].store.id,
      storeOptions,
    } : {}),
  });
  return <PanelLayoutClient model={model}>{props.children}</PanelLayoutClient>;
}
