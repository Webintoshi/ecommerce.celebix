import { LilyumHome } from "../../../../../apps/storefront-shared/themes/lilyum/LilyumHome";
import { storefront, design, presentation, products } from "./data";
export default function Page() { return <LilyumHome storefront={storefront} design={design} projection={{ presentation, productRows: [{ key: "selected", items: products }] }} />; }
