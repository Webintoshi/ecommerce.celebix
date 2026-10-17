import type { HTMLElement as HappyHTMLElement } from "happy-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement, useState } from "react";
import { compile, input, mounted } from "../../lib/mira-final-test-support.ts";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const now = "2026-10-15T12:00:00Z";
const customer = (id: string, name: string) => ({ id, status: "active", displayName: name, firstName: name, lastName: "Test", email: "test@example.test", orderCount: 0, totalSpentCents: 0, currency: "TRY", tags: [], segments: [], addresses: [], consents: [], notes: [], version: 1, createdAt: now, updatedAt: now });
const workspace = { orders: [], notes: [], neighbors: {} };

test("customer summary and row footprints exist before the first response", async () => {
  const pending = deferred<any>();
  const Component = compile("components/customers/CustomerListConsole.tsx", { "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: { summary: () => pending.promise, list: () => pending.promise } } }).CustomerListConsole;
  await mounted(Component, { canManage: true }, async host => {
    assert.ok(host.querySelector('[aria-label="Müşteri özeti"]'), "summary must not be inserted above the toolbar after loading");
    assert.equal(host.querySelectorAll('.customerMetrics .customerMetric').length, 4);
    assert.ok(host.querySelector('.customerDataSurface [role="status"]'));
  });
});

test("taxonomy creation refresh keeps existing rows while preserving new typing", async () => {
  const pending = deferred<any>(); let calls = 0;
  const Component = compile("components/customers/CustomerTaxonomyConsole.tsx", { "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: { tags: async () => ++calls === 1 ? [{ id: "tag-1", name: "Eski etiket", color: "#667085", customerCount: 1 }] : pending.promise, saveTag: async () => ({}) } } }).CustomerTaxonomyConsole;
  await mounted(Component, { kind: "tags", canManage: true }, async (host, window) => {
    const row = host.querySelector('.tagRow'); assert.ok(row);
    const name = host.querySelector('input[name="name"]'); await input(window, name, "Yeni etiket");
    await act(async () => host.querySelector('form').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(host.querySelector('.tagRow') === row, "existing row remains mounted");
    await input(window, name, "Sonraki etiket");
    await act(async () => pending.resolve([{ id: "tag-1", name: "Eski etiket", color: "#667085", customerCount: 1 }, { id: "tag-2", name: "Yeni etiket", color: "#667085", customerCount: 0 }]));
    assert.equal(name.value, "Sonraki etiket");
  });
});

test("late customer detail responses cannot reveal a different record", async () => {
  const first = deferred<any>(), second = deferred<any>(); let change!: (id: string) => void;
  const Component = compile("components/customers/CustomerDetailConsole.tsx", { "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: { get: (id: string) => id === "a" ? first.promise : second.promise, workspace: async () => workspace, tags: async () => [], segments: async () => [] } } }).CustomerDetailConsole;
  function Wrapper() { const [id, setId] = useState("a"); change = setId; return createElement(Component, { customerId: id, canManage: true, canArchive: true }); }
  await mounted(Wrapper, {}, async host => {
    await act(async () => change("b"));
    await act(async () => second.resolve(customer("b", "Doğru müşteri")));
    assert.match(host.textContent, /Doğru müşteri/);
    await act(async () => first.resolve(customer("a", "Eski müşteri")));
    assert.doesNotMatch(host.textContent, /Eski müşteri/);
    assert.match(host.textContent, /Doğru müşteri/);
  });
});

test("locked segments never block basic customer detail or ordinary tag editing",async()=>{
 let segmentReads=0;
 const data={...customer("a","Ada"),tags:[{id:"tag-1",name:"VIP",color:"#667085"}],segments:[{id:"segment-1",name:"Eski segment"}]};
 const Component=compile("components/customers/CustomerDetailConsole.tsx",{"@/lib/customer-ui/client":{CustomerApiError:Error,customerApi:{get:async()=>data,workspace:async()=>workspace,tags:async()=>[{id:"tag-1",name:"VIP",color:"#667085"}],segments:async()=>{segmentReads++;throw Error("feature_not_enabled");}}}}).CustomerDetailConsole;
 await mounted(Component,{customerId:"a",canManage:true,canArchive:true,segmentsAvailable:false},async (host:HappyHTMLElement)=>{
  assert.match(host.textContent??"",/Ada/);assert.equal(segmentReads,0);
  assert.ok(host.querySelector('a[href="/upgrade?feature=growth_tools"]'));
  const tag=Array.from(host.querySelectorAll('label')).find(label=>label.textContent?.includes('VIP'));
  assert.ok(tag);const checkbox=tag.querySelector('input');assert.ok(checkbox);assert.equal(checkbox.disabled,false);
 });
});
