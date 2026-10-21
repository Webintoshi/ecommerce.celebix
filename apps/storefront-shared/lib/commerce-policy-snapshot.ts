import { createDefaultWhatsAppOrderConfig, type StorefrontCommercePolicy } from '@celebix/saas-contracts';

// A failed policy read must not reopen prices or new purchase actions.
export const UNAVAILABLE_COMMERCE_POLICY:StorefrontCommercePolicy=Object.freeze({...createDefaultWhatsAppOrderConfig(),hidePrices:true,hideAddToCart:true,checkoutAllowed:false,version:0});
