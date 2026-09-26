import { Fragment, type ReactNode } from "react";
import type { PublicStarterNavigationItem } from "@celebix/saas-contracts";

export type StorefrontNavigationClasses = Readonly<{
  root: string;
  summary: string;
  panel: string;
  links: string;
  featured: string;
  branch: string;
}>;

const DEFAULT_CLASSES: StorefrontNavigationClasses = Object.freeze({ root: "celebix-store-nav-category", summary: "celebix-store-nav-summary", panel: "celebix-store-nav-panel", links: "celebix-store-nav-links", featured: "celebix-store-nav-featured", branch: "celebix-store-nav-branch" });

/** Pure presentation shared by the live header and the inert design canvas. */
export function StorefrontNavigationItems({ items, mode = "desktop", desktopDisclosure = false, classes = DEFAULT_CLASSES, categoryHref = (slug) => `/categories/${slug}`, renderLink = (href, content, className) => <a href={href} className={className}>{content}</a> }: Readonly<{
  items: readonly PublicStarterNavigationItem[];
  mode?: "desktop" | "mobile";
  desktopDisclosure?: boolean;
  classes?: StorefrontNavigationClasses;
  categoryHref?: (slug: string) => string;
  renderLink?: (href: string, content: ReactNode, className?: string) => ReactNode;
}>) {
  function featured(item: PublicStarterNavigationItem) {
    return item.featured ? renderLink(categoryHref(item.featured.slug), <><img src={item.featured.image.url} alt={item.featured.image.altText} width={item.featured.image.width} height={item.featured.image.height} /><span>{item.featured.name}</span></>, classes.featured) : null;
  }
  function branch(items: readonly PublicStarterNavigationItem[]): ReactNode {
    return items.map((item) => <Fragment key={item.slug}>{renderLink(categoryHref(item.slug), item.name)}{item.children.length ? <div className={classes.branch}>{branch(item.children)}</div> : null}{featured(item)}</Fragment>);
  }
  const disclosure = mode === "mobile" || desktopDisclosure;
  const Root = disclosure ? "details" : "div";
  return <>{items.map((item) => item.children.length || item.featured ? <Root key={item.slug} className={classes.root} data-navigation-mode={mode}>
    {disclosure ? <summary className={classes.summary}>{item.name}<span aria-hidden="true">⌄</span></summary> : renderLink(categoryHref(item.slug), item.name)}
    <div className={classes.panel} data-featured={item.featured ? "true" : "false"}>
      <div className={classes.links}><strong>{item.name}</strong>{renderLink(categoryHref(item.slug), "Tümünü gör")}{branch(item.children)}</div>
      {featured(item)}
    </div>
  </Root> : <Fragment key={item.slug}>{renderLink(categoryHref(item.slug), item.name)}</Fragment>)}</>;
}
