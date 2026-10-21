import type { StorefrontCommercePolicy } from '@celebix/saas-contracts';
import type { StorefrontCommerceRuntime } from './cart/runtime.ts';

/** Only public product/cart projections pass here. Never use for receipts or accounting. */
const MONEY = /^(?:.*Cents|valueMinor|discountPercent|discountPercentage)$/u;
const OPTIONAL_MONEY = new Set(['freeShippingThresholdCents']);

export class StorefrontCommercePolicyError extends Error {
  readonly code = 'whatsapp_only';
  constructor() { super('whatsapp_only'); this.name = 'StorefrontCommercePolicyError'; }
}

export function redactStorefrontPrices<T>(value: T, policy: StorefrontCommercePolicy): T {
  if (!policy.hidePrices) return value;
  function project(current: unknown): unknown {
    if (Array.isArray(current)) return current.map(project);
    if (!current || typeof current !== 'object') return current;
    const result: Record<string, unknown> = {};
    let money = false;
    for (const [key, item] of Object.entries(current)) {
      if (OPTIONAL_MONEY.has(key)) continue;
      if (MONEY.test(key)) { result[key] = null; money = true; }
      else result[key] = project(item);
    }
    if (money) result.pricesHidden = true;
    if (Object.hasOwn(result, 'checkoutReady')) {
      result.checkoutReady = false;
      result.checkoutBlocker = Array.isArray(result.items) && result.items.length === 0 ? 'empty_cart' : 'whatsapp_only';
    }
    return result;
  }
  return project(value) as T;
}

/** A request-local view. The actual repository and its authoritative prices are untouched. */
export function projectPublicRepository<T extends object>(repository: T, policy: StorefrontCommercePolicy): T {
  if (!policy.hidePrices) return repository;
  return new Proxy(repository, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== 'function') return method;
      return async (...args: unknown[]) => {
        if ((property === 'queryPublicCatalog' || property === 'queryPublicCollection') && args[0] && typeof args[0] === 'object') {
          const input = args[0] as Record<string, unknown>;
          args[0] = { ...input, order: input.order === 'price-asc' || input.order === 'price-desc' ? 'featured' : input.order,
            filter: input.filter === 'discounted' ? 'all' : input.filter === 'available_discounted' ? 'available' : input.filter };
        }
        return redactStorefrontPrices(await Reflect.apply(method, target, args), policy);
      };
    },
  });
}

export function requireOnlineCheckout(policy: StorefrontCommercePolicy): void {
  if (!policy.checkoutAllowed) throw new StorefrontCommercePolicyError();
}

export function protectCommerceRuntime(
  source: StorefrontCommerceRuntime,
  resolvePolicy: (hostname: string) => Promise<StorefrontCommercePolicy>,
): StorefrontCommerceRuntime {
  return Object.freeze({
    ...source,
    async resolveCart(hostname, cookie) {
      const policy = await resolvePolicy(hostname);
      return redactStorefrontPrices(await source.resolveCart(hostname, cookie), policy);
    },
    async restoreCart(hostname, token) {
      const policy = await resolvePolicy(hostname);
      return redactStorefrontPrices(await source.restoreCart(hostname, token), policy);
    },
    async mutateCart(hostname, cookie, command) {
      const policy = await resolvePolicy(hostname);
      if (policy.hideAddToCart) {
        if (command.kind === 'add' || command.kind === 'buy_now') throw new StorefrontCommercePolicyError();
        if (command.kind === 'set_quantity') {
          const { cart } = await source.resolveCart(hostname, cookie);
          const previous = cart.items.find(item => item.variantId === command.variantId)?.quantity ?? 0;
          if (command.quantity > previous) throw new StorefrontCommercePolicyError();
        }
      }
      if (command.kind === 'buy_now') requireOnlineCheckout(policy);
      return redactStorefrontPrices(await source.mutateCart(hostname, cookie, command), policy);
    },
    async quote(hostname, ...args) {
      requireOnlineCheckout(await resolvePolicy(hostname));
      return source.quote(hostname, ...args);
    },
    async complete(hostname, ...args) {
      // Native258 checks new writes under the policy lock and still permits durable operation replay.
      return source.complete(hostname, ...args);
    },
  } satisfies StorefrontCommerceRuntime);
}
