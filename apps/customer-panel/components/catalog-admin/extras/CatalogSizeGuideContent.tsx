"use client";

import { useMemo } from "react";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import styles from "./extras.module.css";

/** The same safe HTML boundary used by the public product guide. */
export function CatalogSizeGuideContent({ body }: { body: string }) {
  const html = useMemo(() => normalizeProductDescriptionHtml(body), [body]);
  return <div className={`${styles.guideContent} product-description-rich-text`} dangerouslySetInnerHTML={{ __html: html }} />;
}
