"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = Object.freeze([
  { href: "/", label: "Genel bakış", mark: "G" },
  { href: "/products", label: "Ürünler", mark: "Ü" },
  { href: "/setup", label: "Kurulum", mark: "K" },
]);

export function PanelNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={mobile ? "mobile-navigation" : "panel-navigation"} aria-label={mobile ? "Mobil panel menüsü" : "Panel menüsü"}>
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            <span className="navigation-mark" aria-hidden="true">{link.mark}</span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
