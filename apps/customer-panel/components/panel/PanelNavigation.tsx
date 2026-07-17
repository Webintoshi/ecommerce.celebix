"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = Object.freeze([
  { href: "/", label: "Genel bakış", icon: "home" },
  { href: "/products", label: "Ürünler", icon: "products" },
  { href: "/setup", label: "Kurulum", icon: "setup" },
]);

function NavigationIcon({ name }: { name: string }) {
  if (name === "home") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5v-6h-4v6h-5a1 1 0 0 1-1-1z" /></svg>;
  }
  if (name === "products") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4m-8 4v10" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>;
}

export function PanelNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={mobile ? "mobile-navigation" : "panel-navigation"} aria-label={mobile ? "Mobil panel menüsü" : "Panel menüsü"}>
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            <span className="navigation-mark"><NavigationIcon name={link.icon} /></span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
