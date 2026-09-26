import type { ReactNode } from "react";
import type { PublicProduct, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);

/** Shared catalog summary; purchase behavior is supplied separately by each surface. */
export function ProductDetailSummary({ product, options, classes = {}, renderBrand }: Readonly<{
  product: PublicProduct;
  options: Pick<StarterProductDetailConfigV2, "showSku" | "showBrand">;
  classes?: Readonly<Record<string, string>>;
  renderBrand?: (name: string) => ReactNode;
}>) {
  const primaryVariant = product.variants.find(({ available }) => available) ?? product.variants[0];
  return <>
    <div className={classes.summaryHeader ?? "celebix-product-summary"}>
      <h1>{product.title}</h1>
      {options.showBrand && product.brand ? renderBrand ? renderBrand(product.brand.name) : <span className={classes.brand ?? "celebix-product-brand"}>{product.brand.name}</span> : null}
      {options.showSku && primaryVariant?.sku ? <p className={classes.sku ?? "celebix-product-sku"}>Ürün Kodu: {primaryVariant.sku}</p> : null}
    </div>
    <div className={classes.price ?? "celebix-product-price"}>{product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{money(product.compareAtCents)}</del> : null}<strong>{money(product.priceCents)}</strong></div>
    {product.merchandising?.highlights.length ? <ul className={classes.highlights ?? "celebix-product-highlights"}>{product.merchandising.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
  </>;
}
