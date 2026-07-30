import Link from "next/link";
import type { PublicStarterThemePresentation } from "@celebix/saas-contracts";

export function CategoryShowcase({ showcase }: Readonly<{
  showcase: NonNullable<PublicStarterThemePresentation["categoryShowcase"]>;
}>) {
  return <section className="store-section category-showcase store-container" aria-labelledby="category-showcase-title">
    <div className="section-heading"><div><span>KOLEKSİYONLAR</span><h2 id="category-showcase-title">{showcase.heading}</h2></div></div>
    <div className="category-showcase-grid">
      {showcase.items.map((item) => <Link className="category-showcase-card" href={`/categories/${item.slug}`} key={item.id}>
        <span className="category-showcase-media"><img src={item.image.url} alt={item.image.altText} width={item.image.width} height={item.image.height} /></span>
        <strong>{item.name}</strong><span className="category-showcase-action">Koleksiyonu gör →</span>
      </Link>)}
    </div>
  </section>;
}
