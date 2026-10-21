import assert from 'node:assert/strict';
import test from 'node:test';
import { redactStorefrontPrices, protectCommerceRuntime, projectPublicRepository } from './commerce-policy.ts';

const hidden = { schemaVersion: 1, enabled: true, phone: '+905551112233', hidePrices: true, hideAddToCart: false, messageIntro: 'Merhaba', checkoutAllowed: false, version: 3 } as const;
const ordinary = { ...hidden, enabled: false, hidePrices: false, checkoutAllowed: true };
const catalog = { ...hidden, hidePrices: false, hideAddToCart: true };

test('hidden projection removes real money before serialization and keeps source intact', () => {
  const source = { id: 'p', priceCents: 123456, compareAtCents: 150000, variants: [{ id: 'v', priceCents: 123456 }], title: 'Ürün' };
  const result = redactStorefrontPrices(source, hidden);
  assert.equal(result.priceCents, null);
  assert.equal(result.compareAtCents, null);
  assert.equal(result.variants[0]?.priceCents, null);
  assert.equal((result as typeof result & { pricesHidden: boolean }).pricesHidden, true);
  assert.equal(JSON.stringify(result).includes('123456'), false);
  assert.equal(source.priceCents, 123456);
  assert.equal(redactStorefrontPrices(source, ordinary), source);
});

test('cart money and indirect thresholds are redacted, hidden cart cannot checkout', () => {
  const result = redactStorefrontPrices({ items: [{ unitPriceCents: 100, lineTotalCents: 200, quantity: 2 }], totalCents: 200, subtotalCents: 200, shippingCents: 0, checkoutReady: true, checkoutBlocker: null, cart: { freeShippingThresholdCents: 9000 } }, hidden);
  assert.equal(result.totalCents, null);
  assert.equal(result.items[0]?.quantity, 2);
  assert.equal(result.checkoutReady, false);
  assert.equal(Object.hasOwn(result.cart, 'freeShippingThresholdCents'), false);
});

test('read-only repository decoration preserves method receiver and priced internal source', async () => {
  const source = { amount: 991, async get() { return { priceCents: this.amount }; } };
  assert.deepEqual(await projectPublicRepository(source, hidden).get(), { priceCents: null, pricesHidden: true });
  assert.deepEqual(await source.get(), { priceCents: 991 });
});

test('hidden repository supports frozen own methods without changing the authoritative facade', async () => {
  const result = Object.freeze({ priceCents: 991 });
  const source = Object.freeze({
    async resolveCampaignHome() { assert.equal(this, source); return result; },
  });
  const view = projectPublicRepository(source, hidden);
  assert.deepEqual(await view.resolveCampaignHome(), { priceCents: null, pricesHidden: true });
  assert.equal(await source.resolveCampaignHome(), result);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(projectPublicRepository(source, ordinary), source);
});

test('repository facade keeps optional capabilities and safe own-property reflection', async () => {
  const capability = Symbol('capability');
  const source = Object.freeze({
    async resolveCampaignHome() { return { priceCents: 991 }; },
    [capability]: 'public',
  });
  const view = projectPublicRepository(source, hidden);
  assert.equal('resolveCampaignHome' in view, true);
  assert.equal('queryPublicCollection' in view, false);
  assert.equal((view as { queryPublicCollection?: unknown }).queryPublicCollection, undefined);
  assert.deepEqual(Reflect.ownKeys(view), Reflect.ownKeys(source));
  assert.deepEqual(Object.keys(view), Object.keys(source));
  assert.equal(Object.getPrototypeOf(view), Object.getPrototypeOf(source));
  assert.equal(view[capability], 'public');
  const descriptor = Object.getOwnPropertyDescriptor(view, 'resolveCampaignHome');
  assert.equal(descriptor?.configurable, true);
  assert.deepEqual(await descriptor?.value(), { priceCents: null, pricesHidden: true });
});

test('repository facade preserves private-field receivers and normalizes queries without changing input', async () => {
  class Repository {
    #price = 991;
    get amount() { return this.#price; }
    async queryPublicCatalog(input: { order: string; filter: string }) {
      return { priceCents: this.#price, ...input };
    }
  }
  const source = Object.freeze(new Repository());
  const view = projectPublicRepository(source, hidden);
  const input = Object.freeze({ order: 'price-asc', filter: 'available_discounted' });
  assert.equal(view.amount, 991);
  assert.equal(Object.getPrototypeOf(view), Repository.prototype);
  assert.deepEqual(await view.queryPublicCatalog(input), { priceCents: null, pricesHidden: true, order: 'featured', filter: 'available' });
  assert.deepEqual(await source.queryPublicCatalog(input), { priceCents: 991, ...input });
});

test('catalog mode rejects add, buy now and increases but keeps decrease/removal', async () => {
  let writes = 0;
  const source = {
    async resolveCart() { return { cart: { items: [{ variantId: 'v', quantity: 2 }], priceCents: 999 } }; },
    async mutateCart() { writes++; return { cart: { items: [], priceCents: 999 } }; },
    async quote() { writes++; return {}; }, async complete() { writes++; return {}; },
  };
  const runtime = protectCommerceRuntime(source as never, async () => catalog);
  for (const command of [{ kind: 'add' }, { kind: 'buy_now' }, { kind: 'set_quantity', variantId: 'v', quantity: 3 }]) {
    await assert.rejects(runtime.mutateCart('shop.example', null, command as never), /whatsapp_only/);
  }
  await runtime.mutateCart('shop.example', null, { kind: 'set_quantity', variantId: 'v', quantity: 1 } as never);
  await runtime.mutateCart('shop.example', null, { kind: 'remove', variantId: 'v' } as never);
  await assert.rejects(runtime.quote('shop.example', null, 'cart'), /whatsapp_only/);
  assert.equal(writes, 2);
});

test('durable offline completion replay reaches the native replay guard after policy changes', async () => {
  const replay = { receipt: { orderReference: 'EXISTING' }, setCookies: [] };
  const runtime = protectCommerceRuntime({ async complete() { return replay; } } as never, async () => hidden);
  assert.deepEqual(await runtime.complete('shop.example', null, {} as never), replay);
});

test('unavailable authority never opens restrictions or touches commerce', async () => {
  let called = false;
  const source = { async resolveCart() { called = true; return {}; } };
  const runtime = protectCommerceRuntime(source as never, async () => { throw new Error('policy_unavailable'); });
  await assert.rejects(runtime.resolveCart('shop.example', null), /policy_unavailable/);
  assert.equal(called, false);
});
