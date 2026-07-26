import type { TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel, type PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { resolveDefaultServerAnalyticsRuntime } from "@/lib/server-analytics/default";
import { PanelLayoutClient } from "./PanelLayoutClient";

const SERVER_CONTEXT_PROP = "tenant\u0043ontext" as const;

type PanelShellProps =
  | { children: React.ReactNode; model: PanelChromeModel; [SERVER_CONTEXT_PROP]?: never }
  | { children: React.ReactNode; model?: never; [SERVER_CONTEXT_PROP]: TenantContext };

export async function PanelShell(props: PanelShellProps) {
  const entitledModel = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  const runtimeAvailable = entitledModel.analyticsAvailable
    ? await resolveDefaultServerAnalyticsRuntime().then(value => value !== null, () => false)
    : false;
  const model = Object.freeze({
    ...entitledModel,
    analyticsAvailable: entitledModel.analyticsAvailable && runtimeAvailable,
  });
  return <PanelLayoutClient model={model}>{props.children}</PanelLayoutClient>;
}
