import Link from "next/link";

import type { JewelryCategoryPlaceholder } from "./jewelry-category-placeholders";
import styles from "./campaign-home.module.css";

export function JewelryCategoryPlaceholders({ items }: Readonly<{ items: readonly JewelryCategoryPlaceholder[] }>) {
  if (!items.length) return null;

  return <section className={styles.placeholderCategories} aria-labelledby="jewelry-placeholder-title">
    <div className={styles.sectionHeading}>
      <div>
        <span>KOLEKSİYONLAR</span>
        <h2 id="jewelry-placeholder-title">Kategorileri keşfedin</h2>
      </div>
    </div>
    <div className={styles.placeholderGrid}>
      {items.map((item) => <Link href={item.destination} key={item.slug}>
        <span className={styles.placeholderArtwork} aria-label={`${item.name} kategori görseli henüz eklenmedi`}>
          <strong>{item.label}</strong>
        </span>
        <span className={styles.placeholderName}>{item.name}</span>
      </Link>)}
    </div>
  </section>;
}
