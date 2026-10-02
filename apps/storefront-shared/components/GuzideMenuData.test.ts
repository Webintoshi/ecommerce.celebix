import assert from "node:assert/strict";
import test from "node:test";
import { componentLoader } from "./product-variant-media-test-utils.ts";

const load = componentLoader();
const image = (name: string) => ({ url: `https://media.example.test/${name}.webp`, altText: name, width: 640, height: 854 });

test("Güzide menu photographs follow published category slugs rather than labels or row positions", () => {
  const { buildGuzideMenuImages } = load<{ buildGuzideMenuImages: (presentation: unknown) => Record<string, unknown> }>(new URL("../themes/guzide/guzide-menu.ts", import.meta.url));
  const necklace = image("necklace"), bracelet = image("bracelet");
  const images = buildGuzideMenuImages({
    sections: [{ kind: "category_grid", items: [{ slug: "bileklikler", name: "Yeni isim", image: bracelet }, { slug: "kolyeler", name: "Kolyeler", image: necklace }] }],
    categoryShowcase: { items: [{ slug: "kolyeler", image: image("legacy") }] },
    navigation: { items: [{ name: "Kolyeler", slug: "kolyeler", children: [] }, { name: "Yüzükler", slug: "yuzukler", children: [] }] },
  });
  assert.deepEqual(images.kolyeler, necklace);
  assert.deepEqual(images.bileklikler, bracelet);
  assert.equal(images.yuzukler, undefined);
});

test("featured photographs only decorate their matching category and support nested real branches", () => {
  const { buildGuzideMenuImages } = load<{ buildGuzideMenuImages: (presentation: unknown) => Record<string, unknown> }>(new URL("../themes/guzide/guzide-menu.ts", import.meta.url));
  const ring = image("ring"), stone = image("stone");
  const images = buildGuzideMenuImages({ sections: [], navigation: { items: [
    { name: "Yüzükler", slug: "yuzukler", featured: { slug: "yuzukler", image: ring }, children: [{ name: "Taşlı", slug: "tasli", featured: { slug: "tasli", image: stone }, children: [] }] },
    { name: "Kolyeler", slug: "kolyeler", featured: { slug: "baska-kategori", image: image("unrelated") }, children: [] },
  ] } });
  assert.deepEqual(images.yuzukler, ring);
  assert.deepEqual(images.tasli, stone);
  assert.equal(images.kolyeler, undefined);
});
