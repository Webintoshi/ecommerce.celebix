"use client";

import Image from "next/image";
import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { GIFT_FINDER_HEADER_ICON } from "@/lib/gift-finder-config";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

export function HeaderGiftFinderLink() {
  const { buildPath } = useStorefrontRoute();

  return (
    <Link
      href={buildPath(ROUTES.giftFinder)}
      className="header-utility-icon inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 text-neutral-950 transition-opacity hover:opacity-55"
      aria-label="Hediye bulucu"
    >
      <span className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-neutral-900/10">
        <Image
          src={GIFT_FINDER_HEADER_ICON}
          alt=""
          width={24}
          height={24}
          className="h-full w-full object-cover object-center"
          sizes="24px"
        />
      </span>
    </Link>
  );
}
