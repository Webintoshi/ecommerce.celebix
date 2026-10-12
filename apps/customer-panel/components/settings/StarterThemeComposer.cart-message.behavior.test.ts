import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { normalizeStorefrontDesignDocumentV5, parseStorefrontDesignDocument, type StarterThemeComposition, type StarterThemeCompositionConfigV2, type StarterThemeCompositionConfigV3 } from "@celebix/saas-contracts";
import * as composerModel from "../../lib/starter-theme-composer-model.ts";
import { createStorefrontDesignApi } from "../../lib/storefront-design-ui/client.ts";
import { synchronizeCompositionAnnouncement } from "./design/design-editor-model.ts";
import { applyDesignEdit, beginDesignApply, completeDesignApply, createDesignEditorState } from "./design/workspace-model.ts";
import { compile, DESIGN, withEditor } from "./design/design-editor-test-utils.ts";
import * as money from "../../lib/catalog-ui/money.ts";

function compileComposer() {
  const noop = () => null;
  return compile<{ StarterThemeComposer: React.ComponentType<{ activePanel: "cart"; canManage: boolean; showPreview: boolean; value: StarterThemeComposition; onChange(value: StarterThemeCompositionConfigV2 | StarterThemeCompositionConfigV3): void }> }>(new URL("./StarterThemeComposer.tsx", import.meta.url), {
    "@/lib/starter-theme-composer-model": composerModel,
    "@/components/settings/StarterThemePreview": { StarterThemePreview: noop },
    "@/components/settings/StarterFooterEditor": { StarterFooterEditor: noop },
    "@/components/settings/CollectionNavigationEditor": { CollectionNavigationEditor: noop },
    "@/components/settings/StarterRetailSectionEditors": { StarterRetailSectionEditor: noop },
    "@/lib/catalog-onboarding-ui/client": { catalogOnboardingClient: {} },
    "@/lib/catalog-ui/client": { catalogApi: {} },
    "@/lib/merchant-admin-ui/client": { merchantAdminApi: {} },
    "@/lib/catalog-ui/money": money,
    "./design/DesignAssetField": { DesignAssetField: noop },
    "./design/DesignLinkField": { DesignPathField: noop },
  });
}

for (const cleared of ["", "   "]) {
  test(`cart trust message can be cleared with ${cleared ? "whitespace" : "empty input"}, applied and reopened without a default`, async () => withEditor(async ({ container, render, change }) => {
    const { StarterThemeComposer } = compileComposer();
    const initial = normalizeStorefrontDesignDocumentV5({ ...DESIGN, composition: { ...DESIGN.composition, sections: [], cart: { ...DESIGN.composition.cart, trustMessage: "Özel güven mesajı", showShippingProgress: false, showCheckoutReadiness: false, showQuantitySelector: false, freeShippingThresholdCents: 50000 } } });
    let editor = createDesignEditorState({ design: initial, publishedVersion: 4 });
    let changes = 0;
    const paint = () => render(React.createElement(StarterThemeComposer, {
      activePanel: "cart", canManage: true, showPreview: false,
      value: { ...editor.design.composition, schemaVersion: 3, sections: [] },
      onChange: value => { changes++; editor = applyDesignEdit(editor, synchronizeCompositionAnnouncement(editor.design, value)); },
    }));
    const input = () => [...container.querySelectorAll("label")].find(label => label.firstChild?.textContent === "Güven mesajı")?.querySelector<HTMLInputElement>("input");
    await paint();
    assert.equal(input()?.value, "Özel güven mesajı");
    await change(input()!, cleared);
    await paint();
    assert.equal(changes, 1, "deleting the optional message must reach the controlled parent");
    assert.equal(input()?.value, "");
    assert.equal(container.querySelector('[role="alert"]'), null);
    assert.equal(Object.hasOwn(editor.design.composition.cart, "trustMessage"), false);

    const now = "2026-10-12T10:00:00.000Z", operationId = "60000000-0000-4000-8000-000000000001";
    let live = initial, saved = false;
    const published = { schemaVersion: 2, publicationVersion: 5, publishedAt: now, brand: DESIGN.brand, typography: DESIGN.typography, hero: { enabled: false, slides: [] }, promotion: { ...DESIGN.promotion, destination: null }, announcement: DESIGN.announcement };
    const api = createStorefrontDesignApi(async (path, init) => {
      if (String(path).endsWith("/apply")) {
        const request = JSON.parse(String(init?.body));
        assert.equal(new Headers(init?.headers).get("idempotency-key"), operationId);
        assert.equal(request.expectedPublishedVersion, 4);
        live = normalizeStorefrontDesignDocumentV5(parseStorefrontDesignDocument(request.design));
        assert.equal(Object.hasOwn(live.composition.cart, "trustMessage"), false, "the actual save payload omits the cleared field");
        saved = true;
        const result = { publishedVersion: 5, publishedAt: now, design: live, published };
        return Response.json({ code: "applied", result });
      }
      assert.equal(String(path), "/api/storefront-design/editor");
      return Response.json({ code: "ok", workspace: { schemaVersion: 1, publishedVersion: 5, publishedAt: now, design: live, store: { name: "Fixture", timezone: "Europe/Istanbul" }, media: [], destinations: [] } });
    });
    const started = beginDesignApply(editor, operationId);
    const applied = await api.apply({ expectedPublishedVersion: started.token.expectedPublishedVersion, design: normalizeStorefrontDesignDocumentV5(started.token.design) }, { operationId });
    editor = completeDesignApply(started.state, started.token, applied);
    assert.equal(saved, true);
    assert.equal(editor.status, "applied");
    editor = createDesignEditorState(await api.editor());
    await render(null);
    await paint();
    assert.equal(input()?.value, "", "reopening the saved editor must not restore the default message");
    await change(input()!, "Yeni mağaza güvencesi");
    await paint();
    assert.equal(editor.design.composition.cart.trustMessage, "Yeni mağaza güvencesi");
    assert.equal(input()?.value, "Yeni mağaza güvencesi");
    const { trustMessage: _message, ...unchangedCart } = initial.composition.cart;
    const { trustMessage: _newMessage, ...updatedCart } = editor.design.composition.cart;
    assert.deepEqual(updatedCart, unchangedCart, "cart quantity, shipping and payment visibility settings are preserved");
  }));
}

