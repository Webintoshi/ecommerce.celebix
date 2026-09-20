import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PROMOTION_TEMPLATES } from "./model.ts";

test("template picker renders twelve accessible choices with decorative illustrations and preserves each selection", () => {
  const filename = new URL("../../components/promotions/PromotionTemplatePicker.tsx", import.meta.url);
  const compiled = { exports: {} as Record<string, Function> };
  const nativeRequire = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)((name: string) => name.endsWith(".css") ? new Proxy({}, { get: (_, key) => key }) : nativeRequire(name), compiled, compiled.exports);
  const selected: string[] = [];
  const tree = compiled.exports.PromotionTemplatePicker({ templates: PROMOTION_TEMPLATES, onSelect: (id: string) => selected.push(id) });
  const markup = renderToStaticMarkup(tree);
  assert.equal((markup.match(/<button/g) ?? []).length, 12);
  assert.equal((markup.match(/aria-hidden="true"/g) ?? []).length, 12);
  assert.ok(markup.includes("Kampanyanıza uygun bir başlangıç seçin"));
  const buttons = tree.props.children[1].props.children;
  for (const [index, item] of PROMOTION_TEMPLATES.entries()) {
    assert.ok(markup.includes(item.title));
    assert.equal(buttons[index].props.type, "button");
    buttons[index].props.onClick();
    assert.equal(selected[index], item.id);
  }
});
