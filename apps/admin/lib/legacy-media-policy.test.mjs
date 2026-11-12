import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const loader = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === "./asset-url" ? "./asset-url.ts" : specifier, context);
  },
});
const { LEGACY_ASSET_DOCUMENT_POLICY, isLegacyPublicAddress, legacyImageType, parseLegacyAssetSource } = await import("./legacy-media-policy.ts");
loader.deregister();

test("stored images and proxied image addresses use an HTTPS media authority", () => {
  const source = "https://example.r2.dev/banners/header.png";
  assert.equal(parseLegacyAssetSource(source)?.href, source);
  assert.equal(parseLegacyAssetSource(`/api/assets?src=${encodeURIComponent(source)}`)?.href, source);
  assert.equal(parseLegacyAssetSource("/images/banner.png"), null);
});

test("media lookup permits only public address families", () => {
  assert.equal(isLegacyPublicAddress("8.8.8.8"), true);
  assert.equal(isLegacyPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isLegacyPublicAddress("127.0.0.1"), false);
  assert.equal(isLegacyPublicAddress("::1"), false);
});

test("images have an explicit content type and a script-free document policy", () => {
  assert.equal(legacyImageType("image/svg+xml; charset=utf-8"), "image/svg+xml");
  assert.equal(legacyImageType("text/html"), null);
  assert.match(LEGACY_ASSET_DOCUMENT_POLICY, /default-src 'none'.*sandbox/);
});
