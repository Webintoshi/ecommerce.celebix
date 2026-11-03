import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { LILYUM_COLLECTION_IMAGE_SIZES, lilyumImageSources } from "../themes/lilyum/lilyum-images.ts";

const categoryBase = "https://media.saas-staging.celebix.site/stores/89e1e15f-8282-4e9b-ae3e-f417501bd54a/storefront/category/";
const categoryFiles = ["ff72d131-f251-5fcb-92df-601d3fd1117a.webp", "38dea7f7-ee2a-50de-9793-1f430e3af96b.png", "0e00ab0c-1aff-5175-a987-128d470bbddc.jpg", "3ade2b3c-11d6-522d-8cc0-ead71d1baff8.jpg"];

test("every optimized Lilyum source points to a deployed WebP asset and retains its original fallback", () => {
  const sources = ["/themes/lilyum/flower-atelier-v1.webp", ...categoryFiles.map(file => categoryBase + file)];
  let localCopies = 0;
  for (const source of sources) {
    const result = lilyumImageSources(source, LILYUM_COLLECTION_IMAGE_SIZES);
    assert.equal(result.src, source);
    assert.equal(result.sizes, LILYUM_COLLECTION_IMAGE_SIZES);
    assert.ok(result.srcSet);
    for (const candidate of result.srcSet.split(", ")) {
      const path = candidate.split(" ")[0];
      if (!path.startsWith("/themes/lilyum/optimized/")) continue;
      const file = new URL(`../public${path}`, import.meta.url);
      assert.equal(existsSync(file), true, path);
      const bytes = readFileSync(file);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF", path);
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP", path);
      localCopies += 1;
    }
  }
  assert.equal(localCopies, 15);
});

test("admin replacements, changed URLs and another tenant never receive Lilyum image copies", () => {
  const known = categoryBase + categoryFiles[1];
  for (const source of ["https://media.example/new-admin-image.png", `${known}?v=2`, known.replace("89e1e15f-8282-4e9b-ae3e-f417501bd54a", "20000000-0000-4000-8000-000000000001")]) {
    assert.deepEqual(lilyumImageSources(source, "100vw"), { src: source });
  }
});
