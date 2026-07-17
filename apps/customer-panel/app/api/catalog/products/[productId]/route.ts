import {
  handleDefaultCatalogGetProduct,
  handleDefaultCatalogUpdateProduct,
} from "../../../../../lib/catalog-http/default.ts";

export const GET = handleDefaultCatalogGetProduct;
export const PATCH = handleDefaultCatalogUpdateProduct;
