import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCatalogOnboardingIntent} from '@celebix/saas-contracts';
import {productFields,variantFields} from '../catalog/validation.ts';
import {catalogAdminImportRows,catalogAdminImportProducts} from '../catalog-admin/validation.ts';
import {catalogMigrationProducts} from '../catalog-migration/validation.ts';
const tax={treatment:'taxable',rateBps:1000}as const;
const product={slug:'test-product',title:'Product',status:'draft',currency:'TRY'};
const variant={title:'Default',priceCents:12000,stockTracking:true,stockQuantity:2,attributes:{}};
test('base catalog tax inputs preserve absence, configured tax and explicit variant inheritance without changing price',()=>{
 assert.deepEqual(productFields({...product,tax}).tax,tax);assert.equal(Object.hasOwn(productFields(product),'tax'),false);
 assert.deepEqual(variantFields({...variant,tax}).tax,tax);assert.equal(variantFields({...variant,tax:null}).tax,null);assert.equal(variantFields({...variant,tax}).priceCents,12000);
 assert.equal(Object.hasOwn(variantFields(variant),'tax'),false);assert.throws(()=>productFields({...product,tax:null}));assert.throws(()=>variantFields({...variant,tax:{treatment:'taxable',rateBps:'1000'}}));
});
test('quick and advanced onboarding carry tax without adding keys to legacy intents',()=>{
 const quick={kind:'quick',title:'Product',priceCents:12000,publish:true};
 assert.deepEqual(parseCatalogOnboardingIntent({...quick,tax}).tax,tax);assert.equal(Object.hasOwn(parseCatalogOnboardingIntent(quick),'tax'),false);
 const advanced={kind:'advanced',productType:'physical',title:'Product',publish:true,variants:[{...variant,continueSellingWhenOutOfStock:false,inventory:[],tax:null}],categoryIds:[],resourceIds:{collections:[],tags:[],attributes:[],extras:[],definitions:[]},channelIds:[],profile:{minimumPurchaseQuantity:1},tax};
 const parsed=parseCatalogOnboardingIntent(advanced);assert.equal(parsed.kind,'advanced');if(parsed.kind==='advanced')assert.equal(parsed.variants[0].tax,null);assert.deepEqual(parsed.tax,tax);
});
test('native import rows and product/variant imports retain explicit tax and omit absent legacy tax',()=>{
 const row={title:'Product',slug:'test-product',priceCents:12000,stockQuantity:2};
 assert.deepEqual(catalogAdminImportRows([{...row,tax}])[0].tax,tax);assert.equal(Object.hasOwn(catalogAdminImportRows([row])[0],'tax'),false);
 const imported={title:'Product',slug:'test-product',status:'active',variants:[{title:'Default',priceCents:12000,stockQuantity:2,attributes:{},tax:null}],tax};
 const parsed=catalogAdminImportProducts([imported])[0];assert.deepEqual(parsed.tax,tax);assert.equal(parsed.variants[0].tax,null);
});
test('migration tax choices remain explicit across default and additional variants',()=>{
 const imported={sourceProductId:'1',title:'Product',slug:'test-product',status:'active',categorySlugs:[],brandSlugs:[],variant:{title:'Default',priceCents:12000,stockQuantity:2,attributes:{},tax:null},additionalVariants:[{title:'Other',priceCents:10000,stockQuantity:1,attributes:{color:'red'},tax}],sourceImageDigests:[],tax};
 const parsed=catalogMigrationProducts([imported])[0];assert.deepEqual(parsed.tax,tax);assert.equal(parsed.variant.tax,null);assert.deepEqual(parsed.additionalVariants?.[0].tax,tax);
});
