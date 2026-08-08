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

test("value propositions use visual icon choices and preserve merchant-authored copy",async()=>{
  const source=await read("apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx");
  const css=await read("apps/customer-panel/components/settings/starter-theme-composer.module.css");
  for(const icon of ["Sparkles","Leaf","Heart","ShieldCheck","Truck","RotateCcw"]){assert.match(source,new RegExp(icon));}
  for(const label of ["Özen","Malzeme","Memnuniyet","Güven","Teslimat","İade"]){assert.match(source,new RegExp(label));}
  assert.match(source,/role="group"/);
  assert.match(source,/aria-label="Simge seçimi"/);
  assert.match(source,/aria-pressed=/);
  assert.doesNotMatch(source,/<label>Simge<select/);
  assert.match(source,/updateStarterValueProposition/);
  assert.match(source,/isStarterValuePropositionDraftPublishable/);
  assert.match(source,/useState/);
  assert.match(source,/setDraftSection/);
  assert.match(source,/value=\{item\.heading\}/);
  assert.match(source,/value=\{item\.body\}/);
  assert.match(source,/Yalnızca mağazanızın gerçekten sunduğu avantajları yazın/);
  assert.match(source,/>Değer ekle</);
  assert.doesNotMatch(source,/Doğrulanabilir mağaza vaadinizi açıklayın/);
  assert.match(css,/\.valueIconGrid/);
  assert.match(css,/\.valueIconChoiceSelected/);
  assert.match(css,/min-height:\s*44px/);
});
