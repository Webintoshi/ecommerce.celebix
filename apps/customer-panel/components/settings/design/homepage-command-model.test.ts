import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStarterThemeComposition, normalizeStarterThemeCompositionV4, type HomepageSectionId } from "@celebix/saas-contracts";
import { addHomepageSection, duplicateHomepageSection, moveHomepageSection, removeHomepageSection, restoreRemovedHomepageSection, setHomepageSectionVisibility, updateHomepageSection } from "./homepage-command-model.ts";
const id=(value:string)=>`home_${value}` as HomepageSectionId;
const empty=()=>normalizeStarterThemeCompositionV4({...createDefaultStarterThemeComposition(),sections:[]});
test("inserts a banner between two independent collections and repeats every section kind",()=>{
 let composition=addHomepageSection(empty(),"category_grid",id("first"));
 composition=addHomepageSection(composition,"category_grid",id("second"));
 composition=addHomepageSection(composition,"banner",id("banner"),1);
 assert.deepEqual(composition.sections.map(section=>section.sectionId),[id("first"),id("banner"),id("second")]);
 for(const kind of ["banner","category_grid","product_row","split_campaign","brand_story","value_propositions","testimonials"] as const){
  composition=addHomepageSection(composition,kind,id(`${kind}_repeat`));
  const copy=duplicateHomepageSection(composition,id(`${kind}_repeat`),id(`${kind}_copy`));
  assert.equal(copy.sections.filter(section=>section.kind===kind).length,composition.sections.filter(section=>section.kind===kind).length+1);
 }
});
test("fifty mixed sections retain identities and allow duplicate, hide, remove, restore and ordering",()=>{
 let composition=empty();
 const kinds=["banner","category_grid","product_row","brand_story","testimonials"] as const;
 for(let index=0;index<50;index++) composition=addHomepageSection(composition,kinds[index%kinds.length]!,id(`section_${index}`));
 composition=duplicateHomepageSection(composition,id("section_0"),id("copy"));
 const original=composition.sections[0]!;const copy=composition.sections[1]!;
 assert.notEqual(original,copy);if(original.kind==="banner"&&copy.kind==="banner")assert.notEqual(original.slides[0]?.slideId,copy.slides[0]?.slideId);
 composition=setHomepageSectionVisibility(composition,id("copy"),false);
 const removed=removeHomepageSection(composition,id("section_2"));
 composition=restoreRemovedHomepageSection(removed.composition,removed.undo);
 composition=moveHomepageSection(composition,id("copy"),50);
 assert.equal(composition.sections.length,51);assert.equal(composition.sections.at(-1)?.enabled,false);
 assert.equal(new Set(composition.sections.map(section=>section.sectionId)).size,51);
});
test("manual row edits preserve ordered IDs, stable identity and section appearance",()=>{
 let composition=addHomepageSection(empty(),"product_row",id("manual"));const row=composition.sections[0]!;assert.equal(row.kind,"product_row");if(row.kind!=="product_row")return;
 composition=updateHomepageSection(composition,row.sectionId,{...row,source:"manual",productIds:["40000000-0000-4000-8000-000000000002","40000000-0000-4000-8000-000000000001"],style:{background:"dark",width:"full",spacing:"large"}});
 assert.deepEqual(composition.sections[0],{...row,source:"manual",productIds:["40000000-0000-4000-8000-000000000002","40000000-0000-4000-8000-000000000001"],style:{background:"dark",width:"full",spacing:"large"}});
 assert.throws(()=>addHomepageSection(composition,"banner",row.sectionId));
 assert.throws(()=>moveHomepageSection(composition,row.sectionId,-1));
});
