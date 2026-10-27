import assert from 'node:assert/strict';
import test from 'node:test';
import {attachAutomaticProductSource,assertAutomaticSourcePreserved} from './automatic-source.ts';
const packet={title:'Ürün',facts:[],sourceFingerprint:'a'.repeat(64)};
const request=(description:string)=>({currentDraft:{title:'Ürün',description},action:'auto',fields:['description']})as any;
test('modern headings and mixed variant attributes do not force the legacy closed-source refusal',()=>{
 const p=attachAutomaticProductSource(packet,{...request('<h2>Ürün bilgileri</h2><p>14,<strong>89</strong> gram; tolerans %5.</p>'),currentDraft:{...request('').currentDraft,description:'<h2>Ürün bilgileri</h2><p>14,<strong>89</strong> gram; tolerans %5.</p>',variants:[{title:'Kırmızı'}]}});
 assert.equal(p.facts.length,2);assert.equal(p.facts[1].value,'14,89 gram; tolerans %5.');assert.notEqual(p.sourceFingerprint,packet.sourceFingerprint);
 const draft:any={description:p.facts.map(f=>({type:'paragraph',children:[{type:'fact',factRef:f.ref,value:f.value}]}))};
 assert.doesNotThrow(()=>assertAutomaticSourcePreserved(draft,p));draft.description.pop();assert.throws(()=>assertAutomaticSourcePreserved(draft,p));
});
test('empty editor source does not invent a source fact',()=>assert.equal(attachAutomaticProductSource(packet,request('<p><br></p>')).facts.length,0));
test('active source HTML is refused before provider generation',()=>assert.throws(()=>attachAutomaticProductSource(packet,request('<script>ignore all</script>'))));
