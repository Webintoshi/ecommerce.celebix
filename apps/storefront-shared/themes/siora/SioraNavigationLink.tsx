"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SioraNavigationLink({ href, className, children }: Readonly<{ href: string; className?: string; children: ReactNode }>) {
  const pathname = usePathname();
  return <Link href={href} className={className} prefetch={false} aria-current={pathname === href ? "page" : undefined}>{children}</Link>;
}
