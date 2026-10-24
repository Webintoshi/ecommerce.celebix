import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement } from "react";
import { compile, mounted, click, input } from "../../lib/mira-final-test-support.ts";
import { updateProductDraft } from "../../lib/catalog-ui/product-draft-session.ts";

function creator() {
  const Advanced = (props: any) => createElement("section", { "aria-label": "Detaylı düzenleyici", "data-kind": props.initialKind },
    createElement("input", { "aria-label": "Ürün adı", value: props.draftSession.current.title, onChange: (event: any) => props.onDraftSessionChange(updateProductDraft(props.draftSession, { title: event.target.value })) }),
    createElement("button", { type: "button", onClick: () => props.onDraftSessionChange(updateProductDraft(props.draftSession, {kind:"variant",variants:[{...props.draftSession.current.variants[0],title:"Kırmızı",attributes:{renk:"Kırmızı"},price:"120,00"}]})) }, "Varyantı hazırla"));
  return compile("components/catalog/ProductCreateForm.tsx", {
    "next/dynamic": { __esModule: true, default: () => Advanced },
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: Error, catalogOnboardingClient: {getOptions: async () => ({categories:[],channels:[],resources:[]})} },
    "@/components/catalog-onboarding/ProductQuickCreateDialog": {ProductQuickCreateDialog: ({onAdvanced}:any) => createElement("button", {onClick:onAdvanced}, "Detaylı düzenleyiciye geç")},
  }).ProductCreateForm;
}

test("detailed entry asks single or variant before opening the editor", async () => {
  await mounted(creator(), {}, async host => {
    await click(host, "Detaylı ürün yükle");
    assert.equal(Boolean(host.querySelector('[aria-label="Detaylı düzenleyici"]')), false);
    assert.ok([...host.querySelectorAll("button")].some((button:any) => button.textContent.includes("Tek ürün")));
    await click(host, "Varyantlı ürün");
    assert.equal(host.querySelector('[aria-label="Detaylı düzenleyici"]').getAttribute("data-kind"), "variant");
  });
});

test("single entry and back navigation keep the same unsaved product fields", async () => {
  await mounted(creator(), {initialMode:"advanced"}, async (host, window) => {
    await click(host, "Tek ürün");
    await input(window, host.querySelector('[aria-label="Ürün adı"]'), "Kaybolmayan ürün");
    await click(host, "Ürün yapısına dön");
    await click(host, "Tek ürün");
    assert.equal(host.querySelector('[aria-label="Ürün adı"]').value, "Kaybolmayan ürün");
    assert.equal(host.querySelector('[aria-label="Detaylı düzenleyici"]').getAttribute("data-kind"), "simple");
  });
});

test("an existing variant draft cannot be silently reduced by choosing single product", async () => {
  await mounted(creator(), {initialMode:"advanced"}, async host => {
    await click(host, "Varyantlı ürün");
    await click(host, "Varyantı hazırla");
    await click(host, "Ürün yapısına dön");
    const single = [...host.querySelectorAll("button")].find((button:any) => button.textContent.includes("Tek ürün")) as HTMLButtonElement;
    assert.equal(single.disabled, true);
    await click(host, "Varyantlı ürün");
    assert.equal(host.querySelector('[aria-label="Detaylı düzenleyici"]').getAttribute("data-kind"), "variant");
  });
});

test("a direct detailed variant URL and browser back restore the chosen presentation", async () => {
  await mounted(creator(), {initialMode:"advanced",initialProductKind:"variant"}, async (host, window) => {
    assert.equal(host.querySelector('[aria-label="Detaylı düzenleyici"]').getAttribute("data-kind"), "variant");
    await act(async () => {window.history.replaceState({}, "", "/products/new?mode=advanced&kind=simple"); window.dispatchEvent(new window.Event("popstate"));});
    assert.equal(host.querySelector('[aria-label="Detaylı düzenleyici"]').getAttribute("data-kind"), "simple");
  });
});
