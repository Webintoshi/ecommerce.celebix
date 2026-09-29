import assert from'node:assert/strict';
import test from'node:test';
import{selectInitialContentLocale}from'./locale.ts';
const active={kind:'language_setting',status:'active',config:{defaultLocale:'en',enabledLocales:['en','tr']}}as any;
test('new content uses exact active store default language or tr when none is active',()=>{
 assert.equal(selectInitialContentLocale([]),'tr');
 assert.equal(selectInitialContentLocale([{...active,status:'draft'}]),'tr');
 assert.equal(selectInitialContentLocale([active]),'en');
});
test('ambiguous or malformed active language settings fail closed',()=>{
 assert.throws(()=>selectInitialContentLocale([active,active]));
 assert.throws(()=>selectInitialContentLocale([{...active,config:{defaultLocale:'en',enabledLocales:['tr']}}]));
 assert.throws(()=>selectInitialContentLocale([{...active,config:{defaultLocale:'tr-TR',enabledLocales:['tr']}}]));
});
