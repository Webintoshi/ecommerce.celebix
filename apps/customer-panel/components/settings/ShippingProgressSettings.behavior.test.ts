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
