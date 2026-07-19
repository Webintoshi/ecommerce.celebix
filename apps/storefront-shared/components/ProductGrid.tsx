import type { PublicProduct } from "../../../packages/saas-contracts/src/storefront/index.ts";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: readonly PublicProduct[] }) { return products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="store-empty"><span>◇</span><h2>Ürünler hazırlanıyor</h2><p>Bu mağazanın aktif ürünleri yakında burada olacak.</p></div>; }
