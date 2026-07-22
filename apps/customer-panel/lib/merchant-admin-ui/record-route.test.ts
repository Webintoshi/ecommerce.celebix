import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { getMerchantModuleDefinition } from "./presentation.ts";
import { getMerchantRecordRouteDefinition } from "./record-route.ts";

test("locks each editor route to one merchant record kind", () => {
  assert.equal(getMerchantRecordRouteDefinition("content-blog").kind, "blog_post");
  assert.equal(getMerchantRecordRouteDefinition("payment").kind, "payment_setting");
  assert.throws(
    () => getMerchantRecordRouteDefinition("marketplace_connection"),
    /merchant_record_route_invalid/,
  );
  for (const hostileKey of ["constructor", "toString", "__proto__"]) {
    assert.throws(() => getMerchantRecordRouteDefinition(hostileKey), /merchant_record_route_invalid/);
  }
});

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const sameDeps = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      for (let pass = 0; pass < 20; pass += 1) {
        if (dirty || latest === undefined) { dirty = false; cursor = 0; latest = component(); }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("merchant_record_editor_hook_flush_exhausted");
    },
  };
}

function visitElements(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visitElements(child.props.children as ReactNode, visitor);
  });
}

function firstElement(node: ReactNode, type: string) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => { if (element.type === type && result === undefined) result = element; });
  assert.ok(result, `expected_${type}_element`);
  return result;
}

async function compileMerchantRecordEditor(overrides: Readonly<{
  react: typeof React;
  records: () => Promise<readonly Record<string, unknown>[]>;
  save: (kind: string, input: unknown) => Promise<unknown>;
  push: (path: string) => void;
}>) {
  const output = ts.transpileModule(await readFile(
    new URL("../../components/merchant-admin/MerchantRecordEditor.tsx", import.meta.url),
    "utf8",
  ), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  class CompiledMerchantAdminApiError extends Error { }
  const presentation = await import("./presentation.ts");
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return overrides.react;
    if (specifier === "next/navigation") return { useRouter: () => ({ push: overrides.push, refresh() {} }) };
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      PanelPageHeader: ({ title, description }: { title: string; description: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, description)),
    };
    if (specifier === "@/lib/merchant-admin-ui/client") return { MerchantAdminApiError: CompiledMerchantAdminApiError, merchantAdminApi: Object.freeze({ records: overrides.records, save: overrides.save }) };
    if (specifier === "@/lib/merchant-admin-ui/presentation") return presentation;
    if (specifier === "./merchant-module-console.module.css") return styles;
    throw new Error(`unexpected_merchant_record_editor_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.MerchantRecordEditor as (props: { kind: "blog_post"; recordId: string; returnTo: string; canManage: boolean }) => ReactNode;
}

test("record editor sends one rapid save and keeps a newer request locked after a stale completion", async () => {
  const hookRuntime = createHookRuntime();
  const saves: unknown[] = [];
  const pushes: string[] = [];
  const completions: Array<() => void> = [];
  const recordA = Object.freeze({ id: "record-a", kind: "blog_post", version: 7, name: "A", config: { slug: "a", locale: "tr-TR" }, status: "draft" });
  const recordB = Object.freeze({ id: "record-b", kind: "blog_post", version: 11, name: "B", config: { slug: "b", locale: "tr-TR" }, status: "draft" });
  let selectedId = "record-a";
  const Editor = await compileMerchantRecordEditor({
    react: hookRuntime.runtime,
    records: async () => [selectedId === "record-a" ? recordA : recordB],
    save: async (_kind, input) => {
      saves.push(input);
      return new Promise((resolve) => { completions.push(() => resolve({})); });
    },
    push: (path) => { pushes.push(path); },
  });
  const Console = () => Editor({ kind: "blog_post", recordId: selectedId, returnTo: "/content/blog", canManage: true });
  let view = await hookRuntime.flush(Console);
  const originalFormData = globalThis.FormData;
  class TestFormData {
    get(name: string) { return ({ name: "Current", status: "active", slug: "current", locale: "tr-TR", excerpt: "", body: "", published: "on" } as Record<string, string>)[name] ?? null; }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    let form = firstElement(view, "form");
    const first = (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
    const duplicate = (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
    assert.equal(saves.length, 1);

    selectedId = "record-b";
    view = await hookRuntime.flush(Console, true);
    form = firstElement(view, "form");
    const next = (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
    const nextDuplicate = (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
    assert.equal(saves.length, 2);

    completions[0]?.();
    await first;
    await duplicate;
    assert.deepEqual(pushes, []);
    const stillLocked = (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
    assert.equal(saves.length, 2);

    completions[1]?.();
    await next;
    await nextDuplicate;
    await stillLocked;
    assert.deepEqual(pushes, ["/content/blog"]);
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
  }
});

test("payment editor never accepts provider credentials", () => {
  const fields = getMerchantModuleDefinition("payment_setting").fields.map(({ key }) => key);
  assert.deepEqual(fields, ["enabledMethods", "cashOnDelivery"]);
  for (const key of fields) {
    assert.doesNotMatch(key, /secret|password|credential|token|api.?key/i);
  }
});

test("record editor selects an exact persisted kind and uses its returned version", async () => {
  const source = await readFile(
    new URL("../../components/merchant-admin/MerchantRecordEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /record[.]kind\s*!==\s*kind/);
  assert.match(source, /expectedVersion:\s*record[.]version/);
  assert.match(source, /requestSequence[.]current\s*!==\s*sequence/);
});

test("policy type remains read-only and approved route links are canonical", async () => {
  const source = await readFile(
    new URL("../../components/merchant-admin/MerchantRecordEditor.tsx", import.meta.url),
    "utf8",
  );
  const consoleSource = await readFile(
    new URL("../../components/merchant-admin/MerchantModuleConsole.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /field[.]key\s*===\s*["']policyType["']\s*&&\s*record/);
  assert.match(source, /readOnly/);
  assert.match(source, /config\[field[.]key\]\s*=\s*record[.]config\[field[.]key\]/);
  assert.match(consoleSource, /createRouteFor\(definition[.]kind\)/);
  assert.match(consoleSource, /editRouteFor\(definition[.]kind,\s*record[.]id\)/);
  assert.doesNotMatch(consoleSource, /`\/${definition[.]route}/);
});
