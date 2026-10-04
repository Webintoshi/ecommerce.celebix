import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { compile, withEditor } from './design/design-editor-test-utils.ts';
import * as money from '../../lib/catalog-ui/money.ts';
const feature = () => compile<{ShippingProgressSettings:(props:Record<string,unknown>)=>React.ReactNode}>(new URL('./ShippingProgressSettings.tsx',import.meta.url), {'@/lib/catalog-ui/money':money});
test('free shipping settings preserves dot/comma input and blocks Apply until threshold is valid',async()=>{
 const {ShippingProgressSettings}=feature();
 await withEditor(async({container,render,change,click})=>{
  let config={showShippingProgress:false,showCheckoutReadiness:true,showQuantitySelector:true}, invalid=false;
  const paint=async()=>render(React.createElement(ShippingProgressSettings,{cart:config,disabled:false,onChange:(v:typeof config)=>{config=v;},onValidationChange:(v:boolean)=>{invalid=v;}}));
  await paint();
  const toggle=container.querySelector('input[type=checkbox]');assert.ok(toggle, 'merchant can enable free shipping bar');await click(toggle);await paint();
  assert.equal(config.showShippingProgress,true);assert.equal(invalid,true);
  const input=container.querySelector('input[inputmode=decimal]') as HTMLInputElement;
  assert.ok(input);await change(input,'14.89');await paint();
  assert.equal((config as Record<string,unknown>).freeShippingThresholdCents,1489);assert.equal(invalid,false);assert.equal(input.value,'14.89');
  await change(input,'14,89');await paint();assert.equal((config as Record<string,unknown>).freeShippingThresholdCents,1489);
  await change(input,'-4');await paint();assert.equal(invalid,true);assert.equal(input.value,'-4');assert.equal((config as Record<string,unknown>).freeShippingThresholdCents,1489);
  await click(container.querySelector('input[type=checkbox]')!);await paint();assert.equal(invalid,false);assert.equal(config.showShippingProgress,false);assert.equal((config as Record<string,unknown>).freeShippingThresholdCents,1489);
 });
});

test('free shipping threshold distinguishes Turkish grouping from decimal dots and preserves invalid input',async()=>{
 const {ShippingProgressSettings}=feature();
 await withEditor(async({container,render,change})=>{
  let config={showShippingProgress:true,showCheckoutReadiness:true,showQuantitySelector:true,freeShippingThresholdCents:1489}, invalid=false;
  const paint=()=>render(React.createElement(ShippingProgressSettings,{cart:config,disabled:false,onChange:(value:typeof config)=>{config=value;},onValidationChange:(value:boolean)=>{invalid=value;}}));
  await paint();
  const input=container.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
  for(const [typed,cents] of [['1.000,50',100050],['1.000',100000],['1.000.000,00',100000000],['1000.50',100050],['14.89',1489]] as const){
   await change(input,typed);await paint();assert.equal(config.freeShippingThresholdCents,cents,typed);assert.equal(invalid,false,typed);assert.equal(input.value,typed);
  }
  for(const typed of ['12.34,56','1.000.001','1.000,','']){
   await change(input,typed);await paint();assert.equal(config.freeShippingThresholdCents,1489,typed);assert.equal(invalid,true,typed);assert.equal(input.value,typed);
  }
 });
});
