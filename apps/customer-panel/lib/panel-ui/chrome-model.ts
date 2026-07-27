import type { StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";

export interface PanelChromeModel {
  readonly storeSlug: string;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
}

const ROLE_LABELS: Readonly<Record<StoreMembershipRole, string>> = Object.freeze({
  store_owner: "Mağaza sahibi",
  admin: "Mağaza yöneticisi",
  editor: "İçerik editörü",
  analyst: "Analist",
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value;
}

function invalid(): never {
  throw new Error("panel_chrome_context_invalid");
}

export function createPanelChromeModel(context: TenantContext): PanelChromeModel {
  if (!context || Object.getPrototypeOf(context) !== Object.prototype) invalid();

  if (
    context?.schemaVersion !== 1 ||
    context.store?.status !== "active" ||
    !validText(context.store.slug, 63) ||
    !SLUG.test(context.store.slug) ||
    context.membership?.status !== "active" ||
    !Object.hasOwn(ROLE_LABELS, context.membership.role) ||
    context.entitlements?.status !== "active" ||
    !validText(context.entitlements.planCode, 100) ||
    !Number.isSafeInteger(context.entitlements.version) ||
    context.entitlements.version < 1 ||
    !validText(context.locale, 35)
  ) invalid();

  const host = context.resolvedHost;
  if (
    host !== undefined &&
    (
      host === null ||
      typeof host !== "object" ||
      host.status !== "active" ||
      host.storeId !== context.store.id ||
      host.storeSlug !== context.store.slug ||
      !validText(host.canonicalHostname, 253) ||
      !HOSTNAME.test(host.canonicalHostname)
    )
  ) invalid();

  return Object.freeze({
    storeSlug: context.store.slug,
    membershipLabel: ROLE_LABELS[context.membership.role],
    planCode: context.entitlements.planCode,
    planVersion: context.entitlements.version,
    entitlementStatus: "active" as const,
    ...(host !== undefined ? { storefrontHostname: host.canonicalHostname } : {}),
    locale: context.locale,
  });
}
