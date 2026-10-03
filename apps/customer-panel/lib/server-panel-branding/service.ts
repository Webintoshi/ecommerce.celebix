import "server-only";
import { parsePublicStorefrontDesign, type TenantContext } from "@celebix/saas-contracts";
import type { PublicStorefrontRepository } from "@celebix/saas-data";
import { createPanelChromeModel } from "../panel-ui/chrome-model.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

export type PanelBrandingRepository = Pick<PublicStorefrontRepository, "getPublicStorefront" | "getPublicStorefrontDesign">;
export type PanelStoreBranding = Readonly<{ storeDisplayName: string; storeLogoUrl: string | null }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, PanelBrandingRepository>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

export function registerPanelBrandingRepository(access: ServerPanelAccessRuntime, repository: PanelBrandingRepository): void {
  if (access?.readiness.mode !== "approved_staging" || !access.panelOrigin || repositories.has(access) ||
      typeof repository?.getPublicStorefront !== "function" || typeof repository.getPublicStorefrontDesign !== "function") {
    throw Error("server_panel_branding_runtime_invalid");
  }
  repositories.set(access, Object.freeze({
    getPublicStorefront: repository.getPublicStorefront.bind(repository),
    getPublicStorefrontDesign: repository.getPublicStorefrontDesign.bind(repository),
  }));
}

export function resolvePanelBrandingRepository(access: ServerPanelAccessRuntime): PanelBrandingRepository | null {
  return access?.readiness.mode === "approved_staging" && access.panelOrigin ? repositories.get(access) ?? null : null;
}

export async function resolvePanelStoreBranding(input: Readonly<{
  context: TenantContext | null;
  storeOptions?: readonly Readonly<{ selectionKey: string; displayName: string }>[];
  repository: PanelBrandingRepository | null;
  now: Date;
}>): Promise<PanelStoreBranding | null> {
  const context = input.context;
  if (!context) return null;
  const selectedName = input.storeOptions?.find(option => option.selectionKey === context.store.id)?.displayName;
  let displayName = validName(selectedName) ? selectedName : validName(context.store.slug) ? context.store.slug : "Mağaza";
  const fallback = () => Object.freeze({ storeDisplayName: displayName, storeLogoUrl: null });
  try {
    createPanelChromeModel(context);
    const host = context.resolvedHost;
    if (!host || !UUID.test(context.store.id) || !input.repository || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return fallback();
    const storefront = await input.repository.getPublicStorefront({ hostname: host.canonicalHostname, now: input.now });
    if (storefront.id !== context.store.id || storefront.slug !== context.store.slug || storefront.hostname !== host.canonicalHostname || storefront.primaryHostname !== host.canonicalHostname) return fallback();
    if (!validName(selectedName) && validName(storefront.name)) displayName = storefront.name;
    // This existing public projection reads published_config and resolves normal
    // uploaded media only when it is active and belongs to this store. Retained
    // legacy HTTPS logos remain the existing public-contract exception.
    const published = parsePublicStorefrontDesign(await input.repository.getPublicStorefrontDesign({ storefront, now: input.now }));
    return Object.freeze({ storeDisplayName: displayName, storeLogoUrl: published.brand.logo?.url ?? null });
  } catch {
    return fallback();
  }
}
