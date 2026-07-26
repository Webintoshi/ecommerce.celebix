import assert from "node:assert/strict";
import test from "node:test";

import { isPublicCatalogFeedAddress, validateCatalogFeedUrl } from "./feed-authority.ts";

test("feed URLs are exact canonical HTTPS public authorities", () => {
  assert.equal(validateCatalogFeedUrl("https://feeds.example.com/products.csv?shop=one"), "https://feeds.example.com/products.csv?shop=one");
  for (const value of [
    " http://feeds.example.com/products.csv",
    "http://feeds.example.com/products.csv",
    "https://user:pass@feeds.example.com/products.csv",
    "https://feeds.example.com:8443/products.csv",
    "https://feeds.example.com/products.csv#fragment",
    "https://LOCALHOST/products.csv",
    "https://service.local/products.csv",
    "https://127.0.0.1/products.csv",
    "https://[::1]/products.csv",
    "https://feeds.example.com/%7eproducts.csv",
  ]) assert.throws(() => validateCatalogFeedUrl(value), /catalog_feed_url_invalid/, value);
});

test("only globally routable IPv4 and IPv6 addresses may back a feed host", () => {
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicCatalogFeedAddress(address), true, address);
  for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "224.0.0.1", "::", "::1", "fc00::1", "fe80::1", "2001:db8::1", "::ffff:127.0.0.1", "invalid"]) assert.equal(isPublicCatalogFeedAddress(address), false, address);
});
