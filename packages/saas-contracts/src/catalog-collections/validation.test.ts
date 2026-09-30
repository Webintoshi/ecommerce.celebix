import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogCollectionConfig, parseCatalogCollectionDetail, parseCatalogCollectionListQuery, parseCatalogCollectionMembersQuery, parseCatalogCollectionMembersPage } from "./index.ts";
const id = "12345678-1234-4234-8234-123456789012";
const manual = { schemaVersion: 1, mode: "manual", published: false, featured: false, match: "all", rules: [], sort: "custom" };
test("legacy collection remains manual draft without losing featured state", () => {
  assert.deepEqual(parseCatalogCollectionConfig({featured:true}), {...manual,featured:true});
});
test("automatic collections require one to ten unique well shaped rules", () => {
  const automatic = {...manual,mode:"automatic",rules:[{kind:"category",resourceId:id}]};
  assert.deepEqual(parseCatalogCollectionConfig(automatic), automatic);
  for (const bad of [{...automatic,rules:[]},{...automatic,rules:Array(11).fill(automatic.rules[0])},{...automatic,rules:[{kind:"category",resourceId:id,storeId:id}]},{...manual,rules:automatic.rules},{...manual,published:"true"},{...manual,mode:"other"}]) assert.throws(()=>parseCatalogCollectionConfig(bad));
});
test("paged filters reject authority smuggling and duplicate product selection", () => {
  assert.deepEqual(parseCatalogCollectionListQuery({}),{page:1,pageSize:20,state:"all",sort:"updated"});
  for (const bad of [{page:0},{pageSize:51},{storeId:id},{search:"a\n"},{state:"active"}]) assert.throws(()=>parseCatalogCollectionListQuery(bad));
  assert.throws(()=>parseCatalogCollectionMembersQuery({productIds:[id,id]}));
  assert.deepEqual(parseCatalogCollectionMembersQuery({mode:"catalog",categoryId:id}),{page:1,pageSize:20,mode:"catalog",categoryId:id});
});
test("detail preserves archived product IDs and allows collection multiline description",()=>{
  const value={id,name:"Seçki",slug:"secki",description:"Birinci satır\nİkinci satır",status:"active",config:manual,productIds:[id],productCount:0,publicProductCount:0,version:1,createdAt:"2026-09-30T00:00:00.000Z",updatedAt:"2026-09-30T00:00:00.000Z"};
  assert.deepEqual(parseCatalogCollectionDetail(value),value);
  assert.throws(()=>parseCatalogCollectionDetail({...value,description:"bad\u0000value"}));
});
test("member pages distinguish complete order from filtered page and reject hidden authorities",()=>{
  const value={items:[{id,title:"Gömlek",status:"active",priceCents:19000}],page:1,pageSize:20,totalCount:1,orderedIds:[id]};
  assert.deepEqual(parseCatalogCollectionMembersPage(value),value);
  assert.throws(()=>parseCatalogCollectionMembersPage({...value,items:[{...value.items[0],storeId:id}]}));
  assert.throws(()=>parseCatalogCollectionMembersPage({...value,orderedIds:[id,id]}));
});
