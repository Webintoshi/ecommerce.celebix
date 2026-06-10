"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { buildLocalizedPath } from "@/lib/i18n";
import { useAnnouncementBar } from "@/lib/announcement-bar";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

export function DerycraftTopBar() {
  const { settings, backgroundColor, textColor, isVisible, dismiss } = useAnnouncementBar();
  const { locale, internalPathname } = useStorefrontRoute();

  if (!isVisible || internalPathname.startsWith("/admin")) {
    return null;
  }

  const announcementHref =
    settings.link && settings.link.startsWith("/") && locale
      ? buildLocalizedPath(settings.link, locale)
      : settings.link;

  return (
    <div
      className="relative z-50 border-b border-white/8"
      style={{ backgroundColor }}
      role="region"
      aria-label="Duyuru"
    >
      <div className="mx-auto flex h-9 max-w-[1500px] items-center justify-center px-11 sm:h-10 sm:px-14">
        <p
          className="text-center font-sans text-[10px] font-medium uppercase leading-snug tracking-[0.14em] sm:text-[11px] sm:tracking-[0.18em]"
          style={{ color: textColor }}
        >
          <span>{settings.message}</span>
          {announcementHref && settings.linkText ? (
            <>
              <span className="mx-2.5 hidden opacity-35 sm:inline" aria-hidden>
                |
              </span>
              <Link
                href={announcementHref}
                className="mt-1 inline-block underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-75 sm:mt-0 sm:inline"
              >
                {settings.linkText}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md opacity-50 transition-opacity hover:opacity-100 sm:right-3"
        style={{ color: textColor }}
        aria-label="Duyuruyu kapat"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
