import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import Link from "next/link";
function NotFound() { return <main className="error-page"><span>404</span><h1>Mağaza veya ürün bulunamadı</h1><p>Aradığınız içerik bu alan adında aktif değil.</p><Link className="store-button" href="/">Ana sayfaya dön</Link></main>; }

export default withCommercePolicyPage(NotFound);
