import type { TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel, type PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { PanelLayoutClient } from "./PanelLayoutClient";

const SERVER_CONTEXT_PROP = "tenant\u0043ontext" as const;

type PanelShellProps =
  | { children: React.ReactNode; model: PanelChromeModel; [SERVER_CONTEXT_PROP]?: never }
  | { children: React.ReactNode; model?: never; [SERVER_CONTEXT_PROP]: TenantContext };

export function PanelShell(props: PanelShellProps) {
  const model = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  return <PanelLayoutClient model={model}>{props.children}</PanelLayoutClient>;
}
