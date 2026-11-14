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
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "media.saas-staging.celebix.site",
      port: "",
      pathname: "/stores/7892a771-67a9-42d7-9b36-f4c3e8562e95/products/**",
      search: "",
    }, {
      protocol: "https",
      hostname: "media.saas-staging.celebix.site",
      port: "",
      pathname: "/stores/ff465e64-1491-40ef-8840-c66281155a1d/products/**",
      search: "",
    }],
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 512],
    maximumRedirects: 0,
    maximumResponseBody: 10_000_000,
    maximumDiskCacheSize: 64_000_000,
  },
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
