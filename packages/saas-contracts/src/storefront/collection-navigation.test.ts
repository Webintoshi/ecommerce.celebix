import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStarterThemeComposition } from "../storefront-design/defaults.ts";
import { parseStarterThemeCompositionConfig } from "./validation.ts";
const ID = "10000000-0000-4000-8000-000000000001";
test("typed collection roots coexist with legacy category roots and preserve order", () => {
 const initial = createDefaultStarterThemeComposition();
 const resource = { ...initial, navigation: { rootCategoryIds: [ID], rootLinks: [{ kind: "catalog_collection", resourceId: ID }, { kind: "category", resourceId: ID }] } };
 const result = parseStarterThemeCompositionConfig(resource);
 assert.deepEqual(result.navigation.rootLinks, resource.navigation.rootLinks);
 assert.equal(parseStarterThemeCompositionConfig(initial).navigation.rootLinks, undefined);
 assert.throws(() => parseStarterThemeCompositionConfig({ ...resource, navigation: { ...resource.navigation, rootLinks: [...resource.navigation.rootLinks, resource.navigation.rootLinks[0]] } }));
});
