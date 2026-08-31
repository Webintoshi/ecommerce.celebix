import assert from "node:assert/strict";
import test from "node:test";

import { createDirtyEditorRegistry, createDirtyNavigationGuard } from "./dirty-navigation.ts";

test("clean navigation never asks for confirmation and dirty navigation follows the merchant decision", () => {
  let dirty = false;
  const decisions = [false, true];
  let confirmations = 0;
  const guard = createDirtyNavigationGuard({
    isDirty: () => dirty,
    confirm: () => {
      confirmations += 1;
      return decisions.shift() ?? false;
    },
  });

  assert.equal(guard.canLeave(), true);
  assert.equal(confirmations, 0);
  dirty = true;
  assert.equal(guard.canLeave(), false);
  assert.equal(guard.canLeave(), true);
  assert.equal(confirmations, 2);
});

test("beforeunload is prevented only while the current draft is dirty and cleanup removes the listener", () => {
  let dirty = false;
  let listener: ((event: { preventDefault(): void; returnValue?: string }) => void) | undefined;
  const target = {
    addEventListener(type: string, next: typeof listener) {
      assert.equal(type, "beforeunload");
      listener = next;
    },
    removeEventListener(type: string, next: typeof listener) {
      assert.equal(type, "beforeunload");
      if (listener === next) listener = undefined;
    },
  };
  const guard = createDirtyNavigationGuard({ isDirty: () => dirty, confirm: () => false });
  const cleanup = guard.bindBeforeUnload(target);
  let prevented = 0;
  const event = { preventDefault: () => { prevented += 1; }, returnValue: undefined as string | undefined };

  listener?.(event);
  assert.equal(prevented, 0);
  dirty = true;
  listener?.(event);
  assert.equal(prevented, 1);
  assert.equal(event.returnValue, "");
  cleanup();
  assert.equal(listener, undefined);
});

test("independent editors cannot clear another mounted editor's dirty state", () => {
  const registry = createDirtyEditorRegistry(["product", "variant-create", "variant-edit", "sales"] as const);
  registry.mark("product");
  registry.mark("variant-edit");
  assert.equal(registry.anyDirty(), true);
  assert.deepEqual(registry.dirtyEditors(), ["product", "variant-edit"]);

  registry.clear("product");
  assert.equal(registry.isDirty("product"), false);
  assert.equal(registry.isDirty("variant-edit"), true);
  assert.equal(registry.anyDirty(), true);

  registry.clearAll();
  assert.equal(registry.anyDirty(), false);
});

test("application navigation guard blocks same-origin links when a dirty draft is retained", () => {
  let listener: ((event: any) => void) | undefined;
  let dirty = true;
  const target = {
    addEventListener(type: string, next: typeof listener, capture: boolean) { assert.equal(type, "click"); assert.equal(capture, true); listener = next; },
    removeEventListener(type: string, next: typeof listener, capture: boolean) { assert.equal(type, "click"); assert.equal(capture, true); if (listener === next) listener = undefined; },
  };
  const guard = createDirtyNavigationGuard({ isDirty: () => dirty, confirm: () => false });
  const cleanup = guard.bindApplicationNavigation(target as unknown as Document, () => "https://panel.example/products/1");
  let prevented = 0;
  let stopped = 0;
  const event = {
    defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    target: { closest: () => ({ href: "/orders", target: "", hasAttribute: () => false }) },
    preventDefault: () => { prevented += 1; },
    stopImmediatePropagation: () => { stopped += 1; },
  };
  listener?.(event);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  event.target.closest = () => ({ href: "#product-commerce", target: "", hasAttribute: () => false });
  listener?.(event);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  dirty = false;
  listener?.(event);
  assert.equal(prevented, 1);
  cleanup();
  assert.equal(listener, undefined);
});
