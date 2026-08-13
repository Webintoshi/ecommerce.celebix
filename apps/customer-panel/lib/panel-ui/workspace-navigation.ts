export type PanelWorkspaceTab = Readonly<{
  label: string;
  href: string;
}>;

function tabs(items: readonly PanelWorkspaceTab[]): readonly PanelWorkspaceTab[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

export const CUSTOMER_WORKSPACE_TABS = tabs([
  { label: "Tümü", href: "/customers" },
  { label: "Segmentler", href: "/customers/segments" },
  { label: "Etiketler", href: "/customers/tags" },
]);

export const MARKETING_WORKSPACE_TABS = tabs([
  { label: "Özet", href: "/marketing" },
  { label: "E-posta", href: "/marketing/email" },
  { label: "Telefon", href: "/marketing/phone" },
  { label: "WhatsApp", href: "/marketing/whatsapp" },
]);

export const CONTENT_WORKSPACE_TABS = tabs([
  { label: "Blog", href: "/content/blog" },
  { label: "Sayfalar", href: "/content/pages" },
  { label: "Politikalar", href: "/content/policies" },
]);

export const IMPORT_WORKSPACE_TABS = tabs([
  { label: "Otomatik Yükle", href: "/products/auto-import" },
  { label: "Shopify Dönüştürücü", href: "/products/shopify-converter" },
]);

export function getWorkspaceActiveHref(
  pathname: string,
  workspaceTabs: readonly PanelWorkspaceTab[],
): string | null {
  return workspaceTabs.find(({ href }) => pathname === href)?.href ?? null;
}
