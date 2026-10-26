import type { NextConfig } from "next";

const BASE_SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const BASELINE_CSP_HEADER = {
  key: "Content-Security-Policy",
  value: "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
} as const;
const CHECKOUT_CONTEXT_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/checkout/payment",
        headers: [...BASE_SECURITY_HEADERS],
      },
      {
        source: `/checkout/payment/:contextId(${CHECKOUT_CONTEXT_ID})`,
        headers: [...BASE_SECURITY_HEADERS],
      },
      {
        source: `/((?!checkout/payment(?:$|/${CHECKOUT_CONTEXT_ID}$)).*)`,
        headers: [
          BASELINE_CSP_HEADER,
          ...BASE_SECURITY_HEADERS,
        ],
      },
    ];
  },
};

export default nextConfig;
