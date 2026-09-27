import assert from "node:assert/strict";
import test from "node:test";
import { setupStatus } from "./model.ts";
import { setupPresentation } from "./presentation.ts";
import { inputs, tenant } from "./fixtures.ts";
test("presentation separates access from sales work with fixed useful destinations",()=>{
 const groups=setupPresentation(setupStatus(tenant(),inputs()));assert.deepEqual(groups.map(group=>group.id),["access","sales"]);
 const rows=groups.flatMap(group=>group.items);assert.equal(rows.find(row=>row.id==="access")?.status,"Hazır");assert.equal(rows.find(row=>row.id==="products")?.status,"İşlem gerekiyor");assert.equal(rows.find(row=>row.id==="design")?.recommendation,"İsterseniz logo ekleyin.");
 assert.deepEqual(rows.map(row=>row.href),["/setup","/settings/domains","/products/new","/settings/design","/settings/shipping#checkout-delivery","/settings/payment"]);
});
test("error restriction and payment modes display safe truthful text",()=>{
 const base=setupStatus(tenant(),inputs());for(const state of["unavailable","restricted"]as const){const rows=setupPresentation({...base,products:{state,code:"private SQL detail"}}).flatMap(group=>group.items);assert.equal(rows.find(row=>row.id==="products")?.status,state==="unavailable"?"Kontrol edilemiyor":"Yetki gerekli");assert.equal(JSON.stringify(rows).includes("private SQL detail"),false);assert.equal(rows.find(row=>row.id==="products")?.href,state==="restricted"?null:"/products/new");}
 for(const[kind,state,status]of[["offline","ready","Manuel yöntem etkin"],["configured","action_required","Tamamlanmalı"],["test","action_required","Test ortamı"],["live","ready","Canlı ödeme hazır"],["unavailable","unavailable","Kontrol edilemiyor"]]as const){const row=setupPresentation({...base,payment:{state,code:"fixture",kind}}).flatMap(group=>group.items).find(row=>row.id==="payment");assert.equal(row?.status,status);}
});
