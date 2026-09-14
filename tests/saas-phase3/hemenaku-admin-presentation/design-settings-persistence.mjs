// Local fixture only; never accepts a live URL or copies an authenticated session.
// Start the browser-fixture Next app on 127.0.0.1:3427, then run with
// node --experimental-transform-types tests/saas-phase3/hemenaku-admin-presentation/design-settings-persistence.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createStorefrontDesignApi, StorefrontDesignApiError } from "../../../apps/customer-panel/lib/storefront-design-ui/client.ts";
import { openStarterThemeEditorSession, buildStarterThemeCompositionFromSession } from "../../../apps/customer-panel/lib/starter-theme-composer-model.ts";
import { createPreviewStorefrontDesign } from "../../../packages/storefront-design-ui/src/model.ts";

const origin = "http://127.0.0.1:3427";
const api = createStorefrontDesignApi((path, init) => {
  assert.equal(typeof path, "string");
  assert.ok(path.startsWith("/api/storefront-design"));
  return fetch(`${origin}${path}`, init);
});
const initial = await api.workspace();
assert.equal(initial.store.name, "İzole QA Mağazası", "Only the dedicated synthetic fixture may be mutated");
assert.equal(initial.draft.composition.schemaVersion, 3);
const session = openStarterThemeEditorSession(initial.draft.composition);
const edited = { ...initial.draft, composition: buildStarterThemeCompositionFromSession(session, {
  visual: { ...session.state.visual, headerWidth: session.state.visual.headerWidth === "contained" ? "wide" : "contained" },
}) };
assert.deepEqual(edited.composition.sections, initial.draft.composition.sections);
assert.deepEqual(edited.composition.footer, initial.draft.composition.footer);
assert.deepEqual(edited.hero, initial.draft.hero);
const saved = await api.saveDraft({ expectedDraftVersion: initial.draftVersion, design: edited });
const reread = await api.workspace();
assert.equal(reread.draftVersion, saved.draftVersion);
assert.deepEqual(reread.draft, edited);
console.log("PASS file fixture: actual client + adapter load/edit/save/re-read; untouched sections/footer/media preserved");

await assert.rejects(api.saveDraft({ expectedDraftVersion: initial.draftVersion, design: initial.draft }),
  error => error instanceof StorefrontDesignApiError && error.code === "version_conflict");
assert.deepEqual((await api.workspace()).draft, edited);
console.log("PASS file fixture: stale version rejected, persisted draft unchanged");

const preview = createPreviewStorefrontDesign({ ...reread, draft: edited });
const publication = await api.publish({ expectedDraftVersion: reread.draftVersion, expectedPublishedVersion: reread.publishedVersion });
const publishedRead = await api.workspace();
assert.equal(publishedRead.publishedVersion, publication.publishedVersion);
assert.deepEqual(publishedRead.published, publication.published);
assert.deepEqual(publishedRead.published, {
  ...preview, publicationVersion: publication.publishedVersion, publishedAt: publication.publishedAt,
});

// Compile the actual shared renderer, with no component or model substitutions.
const rendererFile = fileURLToPath(new URL("../../../packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx", import.meta.url));
const code = ts.transpileModule(readFileSync(rendererFile, "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(createRequire(rendererFile), compiled, compiled.exports);
const renderer = compiled.exports.StorefrontDesignRenderer;
const render = design => renderToStaticMarkup(React.createElement(renderer, {
  design, storeName: initial.store.name, now: new Date("2026-09-14T12:00:00.000Z"),
}));
assert.equal(render(publishedRead.published), render(preview));
console.log("PASS file fixture: publish/re-read and actual shared renderer output equal draft preview");
console.log("Scope: synthetic local file persistence across requests, not production repository/auth or storefront catalog E2E. PostgreSQL authority is covered separately.");
