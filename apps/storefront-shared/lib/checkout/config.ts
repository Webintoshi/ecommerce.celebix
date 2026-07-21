import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "../runtime-config.ts";

type Environment = Readonly<Record<string, string | undefined>>;

export const CHECKOUT_ENVIRONMENT_FIELDS = STOREFRONT_DATA_ENVIRONMENT_FIELDS;

export type CheckoutRuntimeConfig = Readonly<{
  database: Readonly<{ name: string; url: string }>;
}>;

function invalid(): never {
  throw new Error("checkout_config_invalid");
}

export function parseCheckoutRuntimeConfig(source: Environment): CheckoutRuntimeConfig {
  try {
    const storefront = parseStorefrontDataConfig(source);
    return Object.freeze({
      database: Object.freeze({ name: storefront.database.name, url: storefront.database.url }),
    });
  } catch {
    return invalid();
  }
}
