import {
  handleDefaultCatalogCreateProduct,
  handleDefaultCatalogListProducts,
} from "../../../../lib/catalog-http/default.ts";

export const GET = handleDefaultCatalogListProducts;
export const POST = handleDefaultCatalogCreateProduct;
