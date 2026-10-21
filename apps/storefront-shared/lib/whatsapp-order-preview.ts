import type { StorefrontPageResolution } from './page-context.ts';
import { redactStorefrontPrices } from './commerce-policy.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}
export function createWhatsAppOrderPreview(dependencies: { resolve(): Promise<StorefrontPageResolution> }) {
  return async (request: Request): Promise<Response> => {
    try {
      const selected = await dependencies.resolve();
      if (selected.kind !== 'active') return json({ code: selected.kind }, selected.kind === 'not_found' ? 404 : 503);
      const { runtime, storefront, commercePolicy: policy } = selected.context;
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== '/api/whatsapp-order/preview' || url.search || url.hash
        || request.headers.get('origin') !== `https://${storefront.hostname}`) return json({ code: 'invalid_origin' }, 403);
      if (request.headers.get('content-type') !== 'application/json') return json({ code: 'invalid_input' }, 400);
      const declared = request.headers.get('content-length');
      if (declared !== null && (!/^\d{1,4}$/u.test(declared) || Number(declared) > 2048)) return json({ code: 'invalid_input' }, 400);
      // Bound streamed bodies as well as declared ones.
      const reader = request.body?.getReader();
      if (!reader) return json({ code: 'invalid_input' }, 400);
      let size = 0; const chunks: Uint8Array[] = [];
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > 2048) { await reader.cancel(); return json({ code: 'invalid_input' }, 400); } chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input: unknown; try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return json({ code: 'invalid_input' }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ code: 'invalid_input' }, 400);
      const row = input as Record<string, unknown>;
      if (!policy.enabled) return json({ code: 'whatsapp_unavailable' }, 409);
      const common = { policy, storeName: storefront.presentation.displayName };
      if (row.kind === 'cart' && Object.keys(row).length === 1) {
        const { cart } = await runtime.cart.resolveCart(storefront.hostname, request.headers.get('cookie'));
        if (cart.itemCount < 1 || !cart.items.length || cart.items.some(line => !line.available)) return json({ code: 'stock_unavailable' }, 409);
        return json({ ...common, cart: redactStorefrontPrices(cart, policy) });
      }
      if (row.kind !== 'product' || Object.keys(row).sort().join(',') !== 'kind,productId,quantity,variantId'
        || typeof row.productId !== 'string' || !UUID.test(row.productId) || typeof row.variantId !== 'string' || !UUID.test(row.variantId)
        || !Number.isSafeInteger(row.quantity) || (row.quantity as number) < 1 || (row.quantity as number) > 9999) return json({ code: 'invalid_input' }, 400);
      const items = await runtime.content.resolveProductIds({ hostname: storefront.hostname, now: new Date(), productIds: [row.productId] });
      const product = items.find(item => item.id === row.productId && item.status === 'active');
      const variant = product?.variants.find(item => item.id === row.variantId);
      if (!product?.available || !variant?.available || variant.stockTracking && variant.stockQuantity < (row.quantity as number)) return json({ code: 'stock_unavailable' }, 409);
      return json({ ...common, product: redactStorefrontPrices(product, policy), variantId: variant.id, quantity: row.quantity });
    } catch { return json({ code: 'unavailable' }, 503); }
  };
}
