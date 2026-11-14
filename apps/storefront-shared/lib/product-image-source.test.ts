import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";
import { EZMEO_STOREFRONT_ID } from "../themes/ezmeo/theme.ts";
import { SIORA_STOREFRONT_ID } from "../themes/siora/theme.ts";
import { optimizedProductImageStorefront } from "./product-image-source.ts";

test("the optimizer accepts only the supported tenant product origins and paths", () => {
  const host = "media.saas-staging.celebix.site";
  for (const storefrontId of [SIORA_STOREFRONT_ID, EZMEO_STOREFRONT_ID]) {
    const source = `https://${host}/stores/${storefrontId}/products/product/photo.jpg`;
    assert.equal(optimizedProductImageStorefront(source), storefrontId);
    assert.ok(nextConfig.images?.remotePatterns?.some((pattern) => pattern.protocol === "https" && pattern.hostname === host &&
      pattern.port === "" && pattern.pathname === `/stores/${storefrontId}/products/**` && pattern.search === ""));
    for (const unsupported of [
      source.replace("https:", "http:"), source.replace(host, `${host}.example`), source.replace(host, `user@${host}`),
      source.replace(host, `${host}:3443`), source.replace(storefrontId, "another-store"), source.replace("/products/", "/banners/"),
      source.replace(".jpg", ".svg"), `${source}?size=640`, `${source}#photo`, "/local/product.jpg",
    ]) assert.equal(optimizedProductImageStorefront(unsupported), undefined, unsupported);
  }
});
