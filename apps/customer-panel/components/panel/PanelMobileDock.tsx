"use client";

import { Home, Menu, Package } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { isPanelNavigationPathActive } from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

export function PanelMobileDock(props: {
  pathname: string;
  menuOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
}) {
  const items = [
    { href: "/" as const, label: "Özet", Icon: Home },
    { href: "/products" as const, label: "Ürünler", Icon: Package },
  ];

  return (
    <nav className={styles.mobileDock} aria-label="Mobil panel menüsü">
      {items.map(({ href, label, Icon }) => {
        const active = isPanelNavigationPathActive(props.pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
      <button
        ref={props.menuButtonRef}
        type="button"
        aria-label="Panel menüsünü aç"
        aria-controls="panel-mobile-drawer"
        aria-expanded={props.menuOpen}
        aria-haspopup="dialog"
        onClick={props.onMenuToggle}
      >
        <Menu aria-hidden="true" />
        <span>Menü</span>
      </button>
    </nav>
  );
}
