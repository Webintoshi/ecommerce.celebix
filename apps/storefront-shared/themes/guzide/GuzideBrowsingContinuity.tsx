"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useGuzideBrowsingContinuity } from "./useGuzideBrowsingContinuity";

export function GuzideBrowsingContinuity({ storefrontId, overlayOpen = false }: Readonly<{ storefrontId: string; overlayOpen?: boolean }>) {
  const pathname = usePathname(), query = useSearchParams().toString();
  useGuzideBrowsingContinuity({ storefrontId, pathname, query, overlayOpen });
  return null;
}
