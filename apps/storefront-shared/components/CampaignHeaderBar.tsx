import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./campaign-header.module.css";

export function CampaignHeaderBar({ displayName, logo, desktopNavigation, desktopSearch, utilities, menuButton, className = "", inert, prefetch }: Readonly<{ displayName: string; logo?: Readonly<{ url: string; altText: string; width?: number; height?: number }> | null; desktopNavigation: ReactNode; desktopSearch?: ReactNode; utilities: ReactNode; menuButton: ReactNode; className?: string; inert?: boolean; prefetch?: boolean }>) {
  return (
      <div
        data-storefront-header-bar
        className={`${styles.bar} ${className}`}
      >
        <div className={styles.container} data-storefront-header-container inert={inert}>
          {desktopNavigation}
          {desktopSearch}
          <Link
            className={styles.wordmark}
            data-storefront-wordmark
            href="/"
            prefetch={prefetch}
            aria-label={`${displayName} ana sayfa`}
          >
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */ <img
                src={logo.url}
                alt={logo.altText || displayName}
                width={logo.width ?? 180}
                height={logo.height ?? 48}
              />
            ) : (
              displayName
            )}
          </Link>
          <div className={styles.actions} data-storefront-header-actions>
            {utilities}
            {menuButton}
          </div>
        </div>
      </div>
  );
}
