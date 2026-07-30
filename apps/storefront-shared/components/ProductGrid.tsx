import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, cardStyle, imageRatio, emptyMessage }: { products: readonly PublicProduct[]; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"]; emptyMessage?: string }) { return products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div> : <div className="store-empty"><span>◇</span><h2>Ürünler hazırlanıyor</h2><p>{emptyMessage ?? "Bu mağazanın aktif ürünleri yakında burada olacak."}</p></div>; }
