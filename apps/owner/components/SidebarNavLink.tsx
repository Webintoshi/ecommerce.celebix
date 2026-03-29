"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarNavLinkProps {
  href: string;
  exact?: boolean;
  children: React.ReactNode;
}

export function SidebarNavLink({ href, exact = false, children }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={`sidebar-link${active ? " active" : ""}`}>
      {children}
    </Link>
  );
}
