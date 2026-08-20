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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/checkout/payment",
        headers: [...BASE_SECURITY_HEADERS],
      },
      {
        source: "/((?!checkout/payment$).*)",
        headers: [
          BASELINE_CSP_HEADER,
          ...BASE_SECURITY_HEADERS,
        ],
      },
    ];
  },
};

export default nextConfig;
