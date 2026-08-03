import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root=path.resolve(import.meta.dirname,"../../../..");
const read=(file)=>readFile(path.join(root,file),"utf8");

test("composer exposes every approved finite retail control",async()=>{
  const sources=(await Promise.all([
    read("apps/customer-panel/components/settings/StarterThemeComposer.tsx"),
    read("apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx"),
    read("apps/customer-panel/components/settings/StarterFooterEditor.tsx"),
  ])).join("\n");
  for(const label of ["Değer önerileri","Müşteri yorumları","Footer","Bülten","Malzeme ve bakım","Sertifikalar","Boyut rehberi","Onaylı yorumlar"]){
    assert.match(sources,new RegExp(label));
  }
  assert.doesNotMatch(sources,/storeId|tenantId|custom HTML|custom CSS|custom JavaScript/);
});

test("footer editor uses typed destinations and reviewed social networks",async()=>{
  const source=await read("apps/customer-panel/components/settings/StarterFooterEditor.tsx");
  for(const kind of ["fixed_policy","category","page","system"]){assert.match(source,new RegExp(kind));}
  for(const network of ["instagram","facebook","youtube","pinterest","tiktok","x"]){assert.match(source,new RegExp(network));}
  assert.doesNotMatch(source,/dangerouslySetInnerHTML|eval\(|new Function/);
});
