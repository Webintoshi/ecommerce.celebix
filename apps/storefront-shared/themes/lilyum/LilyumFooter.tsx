import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterFooter, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";

function lilyumFooterGroups(groups: PublicStarterFooter["groups"]): PublicStarterFooter["groups"] {
  const storeInformation = (heading: string) => ["mağaza", "bilgi"].includes(heading.trim().toLocaleLowerCase("tr-TR"));
  const publicLink = (link: PublicStarterFooter["groups"][number]["links"][number]) => !/^\/(?:account|hesabim|hesabım|hesap)(?:\/|$)/u.test(link.destination.split(/[?#]/u)[0]!.toLocaleLowerCase("tr-TR"));
  const destinations = new Set<string>();
  const storeLinks = groups.filter(group => storeInformation(group.heading)).flatMap(group => group.links).filter(link => {
    if (!publicLink(link) || destinations.has(link.destination)) return false;
    destinations.add(link.destination);
    return true;
  });
  let storeInserted = false;
  return groups.flatMap(group => {
    if (!storeInformation(group.heading)) return [{ ...group, links: group.links.filter(publicLink) }];
    if (storeInserted) return [];
    storeInserted = true;
    return [{ heading: "Mağaza", links: storeLinks }];
  });
}

export function LilyumFooter({ storefront, logo, groups, signature, renderNewsletter }: {
  storefront: PublicStorefront;
  logo?: PublicDesignMedia;
  groups: PublicStarterFooter["groups"];
  signature: ReactNode;
  renderNewsletter?: (newsletter: PublicStarterFooter["newsletter"]) => ReactNode;
  prefetch?: boolean;
}) {
  const p = storefront.presentation;
  const footer = p.schemaVersion === 3 || p.schemaVersion === 4 ? p.footer : { social: [], tone: "dark" as const };
  return <RetailFooter storefront={storefront} presentation={{ ...p, footer: { ...footer, tone: "light" } }} groups={lilyumFooterGroups(groups)} logo={logo} signature={signature} renderNewsletter={renderNewsletter} />;
}
