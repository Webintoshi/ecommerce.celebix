import styles from "./starter-theme-preview.module.css";

export function ProductCards({ contentLabel, count, gridClassName, heading, productTitles }: Readonly<{
  contentLabel: "Aktif katalog" | "Örnek içerik";
  count: 3 | 4 | 8 | 12;
  gridClassName?: string;
  heading?: string;
  productTitles: readonly string[];
}>) {
  const visibleTitles = productTitles.length > 0
    ? productTitles.slice(0, count)
    : Array.from({ length: count }, (_, index) => `Örnek ürün ${index + 1}`);
  return <section className={styles.productSection} aria-label="Ürün sırası önizlemesi" data-preview-content={contentLabel === "Örnek içerik" ? "example" : "catalog"}>
    {heading ? <div className={styles.sectionTitle}><h4>{heading}</h4><span>Tümünü gör</span></div> : null}
    <div className={`${styles.previewProducts} ${gridClassName ?? ""}`}>
      {visibleTitles.map((title, index) => <article key={`${title}-${index}`}>
        <div className={styles.previewProductMedia} aria-hidden="true"><span>{index + 1}</span></div>
        <strong>{title}</strong>
        <small>{contentLabel}</small>
      </article>)}
    </div>
  </section>;
}

export function CategoryPlaceholderCards({ gridClassName, labels, layout }: Readonly<{
  gridClassName?: string;
  labels: readonly string[];
  layout: "duo" | "grid";
}>) {
  return <section
    className={`${styles.previewCategoryPlaceholders} ${layout === "duo" ? styles.categoryLayoutDuo : styles.categoryLayoutGrid} ${gridClassName ?? ""}`}
    aria-label="Kategori görsel alanları için örnek yerleşim"
    data-layout={layout}
    data-preview-content="example"
  >
    {labels.slice(0, 4).map((label, index) => <article key={`${label}-${index}`}>
      <div aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span></div>
      <strong>{label}</strong>
    </article>)}
  </section>;
}
