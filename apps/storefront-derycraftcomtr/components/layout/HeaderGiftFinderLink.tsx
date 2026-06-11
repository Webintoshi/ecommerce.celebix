"use client";

import Image from "next/image";
import Link from "next/link";
import {
  buildStorefrontTransformedImageUrl,
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { GIFT_FINDER_HERO_IMAGE } from "@/lib/gift-finder-config";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

const giftIconSrc =
  buildStorefrontTransformedImageUrl(GIFT_FINDER_HERO_IMAGE, { width: 64, quality: 78 }) ||
  resolveStorefrontAssetUrl(GIFT_FINDER_HERO_IMAGE);

export function HeaderGiftFinderLink() {
  const { buildPath } = useStorefrontRoute();
  const usesProxiedIcon = isProxiedStorefrontAssetUrl(giftIconSrc);

  return (
    <Link
      href={buildPath(ROUTES.giftFinder)}
      className="header-utility-icon inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 text-neutral-950 transition-opacity hover:opacity-55"
      aria-label="Hediye bulucu"
    >
      <span className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-neutral-900/10">
        <Image
          src={giftIconSrc}
          alt=""
          fill
          sizes="24px"
          className="object-cover object-center"
          unoptimized={usesProxiedIcon}
        />
      </span>
    </Link>
  );
}
