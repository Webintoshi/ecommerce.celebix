import { createOrderBumpGet } from "@/lib/order-bumps/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";
import { resolveStorefrontPage } from '@/lib/page-context.ts';

const getOffers = createOrderBumpGet({
  selectAuthority: headers => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.orderBumps ?? null,
});

export async function GET(request: Request) {
  const selected = await resolveStorefrontPage();
  if (selected.kind !== 'active') return Response.json({ code: selected.kind }, { status: selected.kind === 'not_found' ? 404 : 503, headers: { 'cache-control': 'no-store' } });
  if (!selected.context.commercePolicy.checkoutAllowed) return Response.json({ cartVersion: null, heading: null, offers: [] }, { headers: { 'cache-control': 'private, no-store' } });
  return getOffers(request);
}
