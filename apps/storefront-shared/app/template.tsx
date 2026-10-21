import type { ReactNode } from 'react';
import { createDefaultWhatsAppOrderConfig, type StorefrontCommercePolicy } from '@celebix/saas-contracts';
import { CommercePolicyPageBoundary } from '../components/CommercePolicyPageBoundary';
import { resolveStorefrontPage } from '../lib/page-context.ts';

// An unavailable read is distinct from an active store with no saved setting.
const UNAVAILABLE_POLICY:StorefrontCommercePolicy=Object.freeze({...createDefaultWhatsAppOrderConfig(),hidePrices:true,hideAddToCart:true,checkoutAllowed:false,version:0});

export default async function StorefrontTemplate({children}:Readonly<{children:ReactNode}>) {
  const page=await resolveStorefrontPage();
  const policy=page.kind==='active'?page.context.commercePolicy:UNAVAILABLE_POLICY;
  return <CommercePolicyPageBoundary policy={policy}>{children}</CommercePolicyPageBoundary>;
}
