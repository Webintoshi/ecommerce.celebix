import type { PublicStarterNavigation, PublicStarterNavigationItem } from "@celebix/saas-contracts";
import { categoryPath, productIndexPath } from "../../lib/storefront-routes.ts";

export type GuzideCatalogContext = Readonly<{
  title: string;
  slug?: string;
  navigation: PublicStarterNavigation;
}>;

function categoryTrail(items: readonly PublicStarterNavigationItem[], slug: string): readonly PublicStarterNavigationItem[] | null {
  for (const item of items) {
    if (item.kind === "catalog_collection") continue;
    if (item.slug === slug) return [item];
    const trail = categoryTrail(item.children, slug);
    if (trail) return [item, ...trail];
  }
  return null;
}

export function guzideCatalogNavigation(context: GuzideCatalogContext, locale: string) {
  const categories = context.navigation.items.filter(({ kind }) => kind !== "catalog_collection");
  if (!context.slug) return {
    backHref: "/",
    links: [
      { name: "Tümü", href: productIndexPath(locale), current: true },
      ...categories.map(({ name, slug }) => ({ name, href: categoryPath(locale, slug), current: false })),
    ],
  };
  const trail = categoryTrail(categories, context.slug);
  if (!trail) return { backHref: "/", links: [] };
  const current = trail[trail.length - 1]!;
  const parent = trail[trail.length - 2];
  const branch = current.children.length ? current : parent ?? current;
  return {
    backHref: parent ? categoryPath(locale, parent.slug) : "/",
    links: [
      { name: "Tümü", href: categoryPath(locale, branch.slug), current: branch.slug === context.slug },
      ...branch.children.filter(({ kind }) => kind !== "catalog_collection").map(({ name, slug }) => ({ name, href: categoryPath(locale, slug), current: slug === context.slug })),
    ],
  };
}
