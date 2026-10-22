import {AccountingNavigationProvider} from "@/components/accounting/AccountingNavigation";
import { SupportBanner } from "./SupportBanner";
import type { SupportSidecar } from "@/lib/platform-support/policy";
import type { TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel, type PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { resolvePanelAnalyticsAvailability } from "@/lib/server-analytics/availability";
import { resolveDefaultPanelStoreOptions } from "@/lib/panel-store-options/default";
import { resolveDefaultPanelStoreBranding } from "@/lib/server-panel-branding/default";
import { PanelLayoutClient } from "./PanelLayoutClient";
import { commercialNavigationLocks } from "@/lib/commercial-packages/route-model";

const SERVER_CONTEXT_PROP = "tenant\u0043ontext" as const;

type PanelShellProps = (
  | { children: React.ReactNode; model: PanelChromeModel; [SERVER_CONTEXT_PROP]?: never }
  | { children: React.ReactNode; model?: never; [SERVER_CONTEXT_PROP]: TenantContext }) & { support?: SupportSidecar; ordersAccess?: Readonly<{canManageOrders:boolean}>; accountingAccess?: Readonly<{canManageAccounting: boolean; canCollectReceivables: boolean}> };

export async function PanelShell(props: PanelShellProps) {
  const entitledModel = props.model ?? createPanelChromeModel(props[SERVER_CONTEXT_PROP]);
  const context = props[SERVER_CONTEXT_PROP];
  const [analyticsAvailable, stores, branding] = context
    ? await Promise.all([
        resolvePanelAnalyticsAvailability(context),
        props.support ? Promise.resolve(undefined) : resolveDefaultPanelStoreOptions(context.store.id),
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
    accountingCommissionsAvailable: context?.membership.role === "store_owner" || context?.membership.role === "admin",
    cashierOrdersAvailable: context?.membership.role === "cashier" && props.ordersAccess?.canManageOrders === true,
    cashierAccountingAvailable: context?.membership.role === "cashier" && props.accountingAccess?.canManageAccounting === true,
    staffManagementAvailable: Boolean(context && context.membership.role === 'store_owner' && !props.support),
    ...(context?.entitlements ? { lockedNavigationHrefs: commercialNavigationLocks(context) } : {}),
    ...(context ? {
      storeDisplayName: activeStoreName ?? branding?.storeDisplayName ?? entitledModel.storeSlug,
      storeLogoUrl: branding?.storeLogoUrl ?? null,
      activeStoreSelectionKey: context.store.id,
      storeOptions,
    } : {}),
  });
  return <>{props.support && <SupportBanner support={props.support} />}<PanelLayoutClient model={model}><AccountingNavigationProvider commissionsAvailable={model.accountingCommissionsAvailable}>{props.children}</AccountingNavigationProvider></PanelLayoutClient></>;
}
