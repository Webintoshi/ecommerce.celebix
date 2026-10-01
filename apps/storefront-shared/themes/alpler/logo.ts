import type { PublicDesignMedia, PublicStorefront } from "@celebix/saas-contracts";

import { ALPLER_STOREFRONT_ID } from "./theme.ts";

export const ALPLER_NAVY_LOGO_URL = "https://media.saas-staging.celebix.site/stores/9f1f6aed-8719-407e-b64c-fd8e956d3277/design/fda5e61a-3bff-4a41-bc4e-d74b44dda650.png";
export const ALPLER_WHITE_LOGO_URL = "https://media.saas-staging.celebix.site/stores/9f1f6aed-8719-407e-b64c-fd8e956d3277/design/86f05fb8-6de3-4253-8641-d13667bcfd96.png";
const EMBLEM_DIMENSIONS = Object.freeze({ width: 720, height: 540 });

/** Apply known asset dimensions without changing future admin logo selections. */
export function alplerLogoDimensions(storefront: Pick<PublicStorefront, "id">, logo?: PublicDesignMedia) {
  return storefront.id === ALPLER_STOREFRONT_ID && logo && (logo.url === ALPLER_NAVY_LOGO_URL || logo.url === ALPLER_WHITE_LOGO_URL)
    ? EMBLEM_DIMENSIONS
    : null;
}

/** Use the customer's matching white artwork only for the selected navy logo on a dark footer. */
export function alplerFooterLogo(storefront: Pick<PublicStorefront, "id">, logo: PublicDesignMedia | undefined, tone: "light" | "dark"): PublicDesignMedia | undefined {
  if (storefront.id !== ALPLER_STOREFRONT_ID || logo?.url !== ALPLER_NAVY_LOGO_URL || tone !== "dark") return logo;
  return Object.freeze({ ...logo, url: ALPLER_WHITE_LOGO_URL });
}
