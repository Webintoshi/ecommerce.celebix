import type { TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel, type PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { resolvePanelAnalyticsAvailability } from "@/lib/server-analytics/availability";
import { resolveDefaultPanelStoreOptions } from "@/lib/panel-store-options/default";
import { resolveDefaultPanelStoreBranding } from "@/lib/server-panel-branding/default";
import { PanelLayoutClient } from "./PanelLayoutClient";

const SERVER_CONTEXT_PROP = "tenant\u0043ontext" as const;

type PanelShellProps =
  | { children: React.ReactNode; model: PanelChromeModel; [SERVER_CONTEXT_PROP]?: never }
  | { children: React.ReactNode; model?: never; [SERVER_CONTEXT_PROP]: TenantContext };

export async function PanelShell(props: PanelShellProps) {
  const entitledModel = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  const context = props[SERVER_CONTEXT_PROP];
  const [analyticsAvailable, stores, branding] = context
    ? await Promise.all([
        resolvePanelAnalyticsAvailability(context),
        resolveDefaultPanelStoreOptions(context.store.id),
        resolveDefaultPanelStoreBranding(context),
      ])
    : [false, undefined, null] as const;
  const storeOptions = stores?.map((store) => Object.freeze({
        selectionKey: store.storeId,
        displayName: store.displayName,
      }));
  const activeStoreName = storeOptions?.find((store) => store.selectionKey === context?.store.id)?.displayName;
  const model = Object.freeze({
    ...entitledModel,
    analyticsAvailable,
    ...(context ? {
      storeDisplayName: activeStoreName ?? branding?.storeDisplayName ?? entitledModel.storeSlug,
      storeLogoUrl: branding?.storeLogoUrl ?? null,
      activeStoreSelectionKey: context.store.id,
      storeOptions,
    } : {}),
  });
  return <PanelLayoutClient model={model}>{props.children}</PanelLayoutClient>;
}
