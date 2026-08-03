import { StorefrontDesignRenderer, createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";
import type { StorefrontDesignDocument, StorefrontDesignDestinationOption, StorefrontDesignMediaOption } from "@celebix/saas-contracts";

import styles from "../design-settings.module.css";

export function DesignPreview({ design, storeName, publishedVersion, publishedAt, media, destinations, mode, now }: Readonly<{ design: StorefrontDesignDocument; storeName: string; publishedVersion: number; publishedAt: string; media: readonly StorefrontDesignMediaOption[]; destinations: readonly StorefrontDesignDestinationOption[]; mode: "desktop" | "mobile"; now: Date }>) {
  try {
    const preview = createPreviewStorefrontDesign({ draft: design, publishedVersion, publishedAt, media, destinations });
    return <div className={styles.previewViewport} data-mode={mode} aria-label={`${mode === "desktop" ? "Masaüstü" : "Mobil"} mağaza önizlemesi`}><StorefrontDesignRenderer design={preview} storeName={storeName} now={now} compact /></div>;
  } catch {
    return <div className={styles.previewUnavailable} role="status">Önizleme hazır değil</div>;
  }
}
