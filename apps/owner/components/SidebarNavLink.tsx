"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarNavLinkProps {
  href: string;
  exact?: boolean;
  exclude?: string[];
  children: React.ReactNode;
}

export function SidebarNavLink({ href, exact = false, exclude = [], children }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const isExcluded = exclude.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
  const active = !isExcluded && (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link href={href} className={`sidebar-link${active ? " active" : ""}`}>
      {children}
    </Link>
  );
}
