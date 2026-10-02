import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import { compile, withEditor } from "./design-editor-test-utils.ts";

type ImageOption = { key: string; url: string; altText: string };
const EXISTING: ImageOption = { key: "asset:existing", url: "https://fixture.invalid/existing.webp", altText: "Mevcut logo" };
const CREATED: ImageOption = { key: "asset:created", url: "https://fixture.invalid/created.webp", altText: "Yeni logo" };
const { DesignImageField } = compile<{ DesignImageField: (props: Record<string, unknown>) => ReactNode }>(new URL("./DesignImageField.tsx", import.meta.url));

function button(container: HTMLElement, text: string) {
  const result = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent?.trim() === text || item.getAttribute("aria-label") === text);
  assert.ok(result, `Missing ${text}: ${container.textContent}`);
  return result;
}

async function withObjectUrls(run: (revoked: string[]) => Promise<void>) {
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const revoked: string[] = [];
  let sequence = 0;
  URL.createObjectURL = () => `blob:fixture-${++sequence}`;
  URL.revokeObjectURL = url => { revoked.push(url); };
  try { await run(revoked); } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
}

type EditorWindow = Parameters<Parameters<typeof withEditor>[0]>[0]["window"];
async function pick(window: EditorWindow, input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await React.act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event));
}

async function drop(window: EditorWindow, element: HTMLElement, file: File) {
  const event = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file], types: ["Files"] } });
  await React.act(async () => element.dispatchEvent(event as unknown as Event));
}

test("a valid image starts one upload and updates selection only after success", async () => withObjectUrls(async revoked => withEditor(async ({ window, container, render, click }) => {
  const writes: string[] = [], files: File[] = [], busy: [string, boolean][] = [];
  let finish!: (option: ImageOption) => void;
  const upload = new Promise<ImageOption>(resolve => { finish = resolve; });
  await render(React.createElement(DesignImageField, { label: "Logo", value: EXISTING.key, options: [EXISTING], frame: "logo", disabled: false, onChange: (value: string) => writes.push(value), onBusyChange: (id: string, value: boolean) => busy.push([id, value]), onUpload: (file: File) => { files.push(file); return upload; } }));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input, "a keyboard reachable upload trigger must own a native file input");
  let pickerOpened = 0;
  input.click = () => { pickerOpened += 1; };
  await click(container.querySelector<HTMLElement>('[data-image-dropzone]')!);
  assert.equal(pickerOpened, 1);
  const file = new window.File(["image"], "logo.webp", { type: "image/webp" }) as unknown as File;
  await pick(window, input, file);
  assert.equal(files.length, 1);
  assert.deepEqual(writes, []);
  assert.equal(container.querySelector("img")?.getAttribute("src"), "blob:fixture-1");
  assert.equal(container.querySelector('[aria-busy="true"]') !== null, true);
  await drop(window, container.querySelector<HTMLElement>('[data-image-dropzone]')!, file);
  await pick(window, input, file);
  assert.equal(files.length, 1);
  await React.act(async () => finish(CREATED));
  assert.deepEqual(writes, [CREATED.key]);
  assert.deepEqual(busy.map(([, value]) => value), [true, false]);
  assert.ok(busy[0]?.[0]);
  assert.deepEqual(revoked, ["blob:fixture-1"]);
})));

test("invalid files do not upload or replace the selected image", async () => withObjectUrls(async () => withEditor(async ({ window, container, render }) => {
  const files: File[] = [], writes: string[] = [];
  await render(React.createElement(DesignImageField, { label: "Logo", value: EXISTING.key, options: [EXISTING], disabled: false, maxBytes: 4, onChange: (value: string) => writes.push(value), onUpload: async (file: File) => { files.push(file); return CREATED; } }));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await pick(window, input, new window.File(["svg"], "logo.svg", { type: "image/svg+xml" }) as unknown as File);
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /JPG, PNG veya WebP/);
  await pick(window, input, new window.File(["12345"], "logo.png", { type: "image/png" }) as unknown as File);
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /en fazla/);
  assert.equal(container.querySelector("img")?.getAttribute("src"), EXISTING.url);
  assert.deepEqual(files, []);
  assert.deepEqual(writes, []);
})));

test("failure keeps the file preview and Retry sends the exact same file", async () => withObjectUrls(async revoked => withEditor(async ({ window, container, render, click }) => {
  const files: File[] = [], writes: string[] = [], pending: [string, boolean][] = [];
  let finish!: (option: ImageOption) => void;
  await render(React.createElement(DesignImageField, { label: "Logo", value: EXISTING.key, options: [EXISTING], disabled: false, onChange: (value: string) => writes.push(value), onPendingChange: (id: string, value: boolean) => pending.push([id, value]), onUpload: async (file: File) => { files.push(file); if (files.length === 1) throw new Error("SQL secret raw error"); return new Promise<ImageOption>(resolve => { finish = resolve; }); } }));
  const file = new window.File(["image"], "logo.png", { type: "image/png" }) as unknown as File;
  await drop(window, container.querySelector<HTMLElement>('[data-image-dropzone]')!, file);
  assert.deepEqual(writes, []);
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Seçiminiz korundu/);
  assert.doesNotMatch(container.textContent ?? "", /SQL|secret|raw error/);
  assert.equal(container.querySelector("img")?.getAttribute("src"), "blob:fixture-1");
  assert.deepEqual(revoked, []);
  assert.deepEqual(pending.map(([, value]) => value), [true]);
  const retry = button(container, "Tekrar dene");
  await click(retry);
  await click(retry);
  assert.equal(files.length, 2);
  assert.equal(files[0], file);
  assert.equal(files[1], file);
  await React.act(async () => finish(CREATED));
  assert.deepEqual(writes, [CREATED.key]);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.deepEqual(revoked, ["blob:fixture-1"]);
  assert.deepEqual(pending.map(([, value]) => value), [true, false]);
  assert.equal(pending[0]?.[0], pending[1]?.[0]);
  assert.match(pending[0]?.[0] ?? "", /-selection$/);
})));

test("unmount releases its unique busy id and ignores a late upload result", async () => withObjectUrls(async revoked => withEditor(async ({ window, container, render }) => {
  const writes: string[] = [], busy: [string, boolean][] = [], pending: [string, boolean][] = [];
  let finish!: (option: ImageOption) => void;
  const onBusyChange = (id: string, value: boolean) => busy.push([id, value]);
  await render(React.createElement(React.Fragment, null,
    React.createElement(DesignImageField, { label: "Görsel", value: "", options: [], disabled: false, onChange: (value: string) => writes.push(value), onBusyChange, onPendingChange: (id: string, value: boolean) => pending.push([id, value]), onUpload: () => new Promise<ImageOption>(resolve => { finish = resolve; }) }),
    React.createElement(DesignImageField, { label: "Görsel", value: "", options: [], disabled: false, onChange: () => {}, onBusyChange, onUpload: async () => CREATED })));
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  assert.notEqual(inputs[0]?.id, inputs[1]?.id);
  await pick(window, inputs[0]!, new window.File(["image"], "banner.webp", { type: "image/webp" }) as unknown as File);
  await render(null);
  assert.deepEqual(busy.map(([, value]) => value), [true, false]);
  assert.equal(busy[0]?.[0], busy[1]?.[0]);
  assert.deepEqual(pending.map(([, value]) => value), [true, false]);
  assert.notEqual(pending[0]?.[0], busy[0]?.[0]);
  await React.act(async () => finish(CREATED));
  assert.deepEqual(writes, []);
  assert.deepEqual(busy.map(([, value]) => value), [true, false]);
  assert.deepEqual(pending.map(([, value]) => value), [true, false]);
  assert.deepEqual(revoked, ["blob:fixture-1"]);
})));

test("a failed empty image can be discarded without changing the original selection", async () => withObjectUrls(async revoked => withEditor(async ({ window, container, render, click }) => {
  const writes: string[] = [], pending: boolean[] = [];
  await render(React.createElement(DesignImageField, { label: "Mobil görseli", value: "", options: [], disabled: false, emptyLabel: "Masaüstü görselini kullan", onChange: (value: string) => writes.push(value), onPendingChange: (_id: string, value: boolean) => pending.push(value), onUpload: async () => { throw new Error("unavailable"); } }));
  await pick(window, container.querySelector<HTMLInputElement>('input[type="file"]')!, new window.File(["image"], "mobile.webp", { type: "image/webp" }) as unknown as File);
  assert.deepEqual(pending, [true]);
  await click(button(container, "Vazgeç"));
  assert.deepEqual(pending, [true, false]);
  assert.deepEqual(writes, []);
  assert.equal(container.querySelector("img"), null);
  assert.match(container.textContent ?? "", /Masaüstü görselini kullan/);
  assert.deepEqual(revoked, ["blob:fixture-1"]);
})));

test("library selection, removal and Escape retain accessible focus and fallback text", async () => withEditor(async ({ window, container, render, click }) => {
  const writes: string[] = [];
  const props = { label: "Mobil görseli", value: "", options: [EXISTING], disabled: false, emptyLabel: "Masaüstü görselini kullan", onChange: (value: string) => writes.push(value) };
  await render(React.createElement(DesignImageField, props));
  assert.match(container.textContent ?? "", /Masaüstü görselini kullan/);
  assert.equal(container.querySelector("select"), null);
  const trigger = button(container, "Kütüphaneden seç");
  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const option = button(container, "Mevcut logo görselini seç");
  assert.equal(option.value, EXISTING.key);
  await React.act(async () => option.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event));
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(window.document.activeElement, trigger);
  const framedTrigger = container.querySelector<HTMLButtonElement>('[data-image-dropzone]')!;
  await click(framedTrigger);
  await React.act(async () => button(container, "Mevcut logo görselini seç").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event));
  assert.equal(window.document.activeElement, framedTrigger);
  await click(trigger);
  await click(button(container, "Mevcut logo görselini seç"));
  assert.deepEqual(writes, [EXISTING.key]);
  await render(React.createElement(DesignImageField, { ...props, value: EXISTING.key }));
  await click(button(container, "Kaldır"));
  assert.deepEqual(writes, [EXISTING.key, ""]);
  await render(React.createElement(DesignImageField, { ...props, value: "missing" }));
  assert.match(container.textContent ?? "", /Görsel kullanılamıyor/);
}));

test("read-only image controls prevent upload, drop, selection and removal", async () => withEditor(async ({ window, container, render, click }) => {
  const writes: string[] = [], files: File[] = [];
  await render(React.createElement(DesignImageField, { label: "Logo", value: EXISTING.key, options: [EXISTING], disabled: true, onChange: (value: string) => writes.push(value), onUpload: async (file: File) => { files.push(file); return CREATED; } }));
  await click(button(container, "Kaldır"));
  await click(button(container, "Kütüphaneden seç"));
  await drop(window, container.querySelector<HTMLElement>('[data-image-dropzone]')!, new window.File(["image"], "logo.webp", { type: "image/webp" }) as unknown as File);
  assert.deepEqual(writes, []);
  assert.deepEqual(files, []);
  assert.equal(container.querySelector('[data-image-option]'), null);
}));
