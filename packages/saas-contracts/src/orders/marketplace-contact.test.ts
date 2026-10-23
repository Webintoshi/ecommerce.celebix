import assert from 'node:assert/strict';
import test from 'node:test';
import {parseOrderListItem} from './validation.ts';
const item={id:'11111111-1111-4111-8111-111111111111',orderNumber:'TY-123',source:'marketplace',customerName:'Müşteri',customerEmail:'',currency:'TRY',totalCents:10000,status:'confirmed',paymentStatus:'completed',itemCount:1,createdAt:'2026-10-23T12:00:00.000Z',updatedAt:'2026-10-23T12:00:00.000Z',version:1};
test('marketplace can withhold buyer email without breaking order readers or inventing a contact',()=>{
 assert.equal(parseOrderListItem(item).customerEmail,null);
 assert.equal(parseOrderListItem({...item,customerEmail:'relay@example.test'}).customerEmail,'relay@example.test');
 assert.throws(()=>parseOrderListItem({...item,source:'storefront'}));
 assert.throws(()=>parseOrderListItem({...item,source:'manual'}));
});
