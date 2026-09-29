import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PROMOTION_PICKER_KINDS } from "@celebix/saas-contracts";
import { createPromotionDraft, updatePromotionDraft } from "./model.ts";

const nativeRequire = createRequire(import.meta.url);
const filename = new URL("../../components/promotions/PromotionTargetPicker.tsx", import.meta.url);
const source = readFileSync(filename, "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const compiled = { exports: {} as Record<string, React.ComponentType<Record<string, unknown>>> };
const css = new Proxy({}, { get: (_, key) => key });

new Function("require", "module", "exports", code)((name: string) => {
  if (name === "react") return React;
  if (name === "@celebix/saas-contracts") return { PROMOTION_PICKER_KINDS };
  if (name === "@/lib/promotion-ui/client") return {
    PromotionTargetPageLoader: class {},
    promotionApi: {},
  };
  if (name === "@/lib/promotion-ui/model") return { updatePromotionDraft };
  if (name.endsWith(".css")) return { default: css };
  return nativeRequire(name);
}, compiled, compiled.exports);

const TargetPicker = compiled.exports.PromotionTargetPicker;

test("category campaign opens its category results without an extra type choice", () => {
  const html = renderToStaticMarkup(React.createElement(TargetPicker, {
    draft: createPromotionDraft("category_percentage"),
    mode: "include",
    onChange: () => {},
    preferredKind: "category",
    restrictKinds: ["category"],
    title: "İndirim uygulanacak kategoriler",
    help: "En az bir kategori seçin.",
  }));

  assert.match(html, /İndirim uygulanacak kategoriler/);
  assert.match(html, /En az bir kategori seçin/);
  assert.match(html, /placeholder="Örnek: kategori adı"/);
  assert.doesNotMatch(html, /Ne seçmek istiyorsunuz\?/);
});

test("preferred variant opens first while the regular catalog options remain available", () => {
  const html = renderToStaticMarkup(React.createElement(TargetPicker, {
    draft: createPromotionDraft("bundle_price"),
    mode: "include",
    onChange: () => {},
    preferredKind: "variant",
  }));

  assert.match(html, /placeholder="Örnek: varyant adı"/);
  assert.match(html, /<option value="variant" selected="">Varyant<\/option>/);
  assert.match(html, /<option value="category">Kategori<\/option>/);
});
