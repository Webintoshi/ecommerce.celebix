import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as presentation from "./presentation.ts";
test("nonowner invitation console contains no recipient list or management controls", async () => {
  const source = await readFile(new URL("../../components/store-admin-invitations/StoreAdminInvitationsConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as any };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React; if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith("presentation")) return presentation;
    if (name.endsWith(".css")) return { default: {} };
    if (name.includes("management-client")) return { invitationManagementClient: {} };
    if (name.includes("merchant-admin-ui/client")) return { merchantAdminApi: {} };
    throw Error(name);
  }, module, module.exports);
  const html = renderToStaticMarkup(React.createElement(module.exports.StoreAdminInvitationsConsole, { canManage: false }));
  assert.match(html, /Yalnız mağaza sahibi/); assert.doesNotMatch(html, /<button|<table|recipient@example|Yeni davet/);
});
test("actual administrator list/new/edit pages use explicit owner policy, not broad configuration permission", async () => {
  for (const path of ["page.tsx", "new/page.tsx", "[recordId]/edit/page.tsx"]) for (const role of ["store_owner", "admin", "editor", "analyst"]) {
    const source = await readFile(new URL(`../../app/settings/administrators/${path}`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} as any }, Component = () => null;
    Function("require", "module", "exports", output)((name: string) => {
      if (name === "react/jsx-runtime") return jsx;
      if (name.endsWith("server-access")) return { requireServerPanelAccess: async () => ({ tenantContext: { membership: { role } } }) };
      if (name.includes("StoreAdminInvitationsConsole")) return { StoreAdminInvitationsConsole: Component };
      if (name.includes("StoreAdminInvitationSource")) return { StoreAdminInvitationSource: Component };
      throw Error(name);
    }, module, module.exports);
    const result = await module.exports.default({ params: Promise.resolve({ recordId: "10000000-0000-4000-8000-000000000001" }) });
    assert.equal(result.props.canManage, role === "store_owner");
    if (path.startsWith("[")) assert.equal(result.props.recordId, "10000000-0000-4000-8000-000000000001");
  }
});
