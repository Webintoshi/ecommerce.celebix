import assert from "node:assert/strict";
import test from "node:test";
import type { PublicStarterNavigation } from "@celebix/saas-contracts";
import { componentLoader } from "./product-variant-media-test-utils.ts";

const navigation: PublicStarterNavigation = { items: [
  { name: "Kolyeler", slug: "kolyeler", children: [
    { name: "Taşlı Kolyeler", slug: "tasli-kolyeler", children: [] },
    { name: "Sade Kolyeler", slug: "sade-kolyeler", children: [] },
  ] },
  { name: "Bileklikler", slug: "bileklikler", children: [] },
  { name: "Kolyeler koleksiyonu", slug: "kolyeler", kind: "catalog_collection", resourceId: "00000000-0000-4000-8000-000000000003", path: "/collections/kolyeler", children: [] },
] };
const load = componentLoader();
type Result = Readonly<{ backHref: string; links: readonly Readonly<{ name: string; href: string; current: boolean }>[] }>;
type Module = { guzideCatalogNavigation: (context: { title: string; slug?: string; navigation: PublicStarterNavigation }, locale: string) => Result };
const module = () => load<Module>(new URL("../themes/guzide/guzide-catalog.ts", import.meta.url));

test("Güzide catalog category tabs use actual published child names and routes, without collection collisions", () => {
  const selected = module().guzideCatalogNavigation({ title: "Kolyeler", slug: "kolyeler", navigation }, "tr");
  assert.deepEqual(selected, { backHref: "/", links: [
    { name: "Tümü", href: "/kategori/kolyeler", current: true },
    { name: "Taşlı Kolyeler", href: "/kategori/tasli-kolyeler", current: false },
    { name: "Sade Kolyeler", href: "/kategori/sade-kolyeler", current: false },
  ] });
});

test("Güzide child category retains sibling tabs and a real parent back path", () => {
  const selected = module().guzideCatalogNavigation({ title: "Taşlı Kolyeler", slug: "tasli-kolyeler", navigation }, "en-US");
  assert.equal(selected.backHref, "/categories/kolyeler");
  assert.deepEqual(selected.links.map(({ name, href, current }) => [name, href, current]), [
    ["Tümü", "/categories/kolyeler", false], ["Taşlı Kolyeler", "/categories/tasli-kolyeler", true], ["Sade Kolyeler", "/categories/sade-kolyeler", false],
  ]);
});

test("Güzide product index offers only admin categories and unknown categories do not invent facets", () => {
  assert.deepEqual(module().guzideCatalogNavigation({ title: "Ürünler", navigation }, "tr").links, [
    { name: "Tümü", href: "/urunler", current: true }, { name: "Kolyeler", href: "/kategori/kolyeler", current: false }, { name: "Bileklikler", href: "/kategori/bileklikler", current: false },
  ]);
  assert.deepEqual(module().guzideCatalogNavigation({ title: "Yeni Kategori", slug: "yeni", navigation }, "tr"), { backHref: "/", links: [] });
});
