"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import styles from "./ProductThumbnail.module.css";

function ThumbnailPhoto({ imageUrl }: Readonly<{ imageUrl: string }>) {
  const [failed, setFailed] = useState(false);
  return failed ? <Package size={20} aria-hidden="true" /> : (
    <img
      className={styles.image}
      src={imageUrl}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function ProductThumbnail({ imageUrl, className }: Readonly<{
  imageUrl?: string | null;
  className: string;
}>) {
  const source = imageUrl?.trim();
  return (
    <span className={`${styles.thumbnail} ${className}`} aria-hidden="true">
      {source ? <ThumbnailPhoto key={source} imageUrl={source} /> : <Package size={20} aria-hidden="true" />}
    </span>
  );
}
