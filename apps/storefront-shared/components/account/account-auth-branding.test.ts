import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { accountAuthButtonTextColor, resolveAccountAuthBranding } from "./account-auth-branding.ts";
import { componentLoader } from "../product-variant-media-test-utils.ts";

function storefront(
  displayName: string,
  logoUrl?: string,
): PublicStorefront {
  return {
    presentation: {
      schemaVersion: 3,
      displayName,
      ...(logoUrl
        ? {
            logo: {
              url: logoUrl,
              mediaType: "image/png",
              altText: `${displayName} logosu`,
              width: 240,
              height: 80,
            },
          }
        : {}),
      theme: {
        colorScheme: "neutral",
        headingStyle: "sans",
        productCardStyle: "editorial",
        productImageRatio: "portrait",
        homeProductLimit: 8,
        showBrandStory: false,
      },
    },
  } as unknown as PublicStorefront;
}

function design(
  primaryColor: string,
  logoUrl?: string,
  publicationVersion = 2,
): PublicStorefrontDesign {
  return {
    publicationVersion,
    brand: {
      logo: logoUrl ? { url: logoUrl, altText: "Yayınlanmış logo" } : null,
      primaryColor,
      accentColor: primaryColor,
      backgroundColor: "#FFFFFF",
      textColor: "#111111",
      fontFamily: "inter",
    },
  } as unknown as PublicStorefrontDesign;
}

test("account branding keeps two resolved stores isolated", () => {
  const first = resolveAccountAuthBranding(
    storefront("Mağaza A", "https://media.example/presentation-a.png"),
    design("#2457D6", "https://media.example/published-a.png"),
  );
  const second = resolveAccountAuthBranding(
    storefront("Mağaza B", "https://media.example/presentation-b.png"),
    design("#F4C542", "https://media.example/published-b.png"),
  );

  assert.equal(first.displayName, "Mağaza A");
  assert.equal(first.primaryColor, "#2457D6");
  assert.equal(first.logo?.url, "https://media.example/published-a.png");
  assert.equal(second.displayName, "Mağaza B");
  assert.equal(second.primaryColor, "#F4C542");
  assert.equal(second.logo?.url, "https://media.example/published-b.png");
  assert.notDeepEqual(first, second);
});

test("account branding falls back from published logo to presentation logo and name", () => {
  const presentationLogo = resolveAccountAuthBranding(
    storefront("Sunum Logolu", "https://media.example/presentation.png"),
    design("#2457D6"),
  );
  const nameOnly = resolveAccountAuthBranding(
    storefront("Yalnız Ad"),
    design("#2457D6"),
  );

  assert.deepEqual(presentationLogo.logo, {
    url: "https://media.example/presentation.png",
    altText: "Sunum Logolu logosu",
    width: 240,
    height: 80,
  });
  assert.equal(nameOnly.logo, null);
  assert.equal(nameOnly.displayName, "Yalnız Ad");
  assert.equal(nameOnly.themeClasses, "theme-neutral heading-sans");
});

test("unpublished design never replaces the presentation logo", () => {
  const value = resolveAccountAuthBranding(
    storefront("Başlangıç", "https://media.example/presentation.png"),
    design("#2457D6", "https://media.example/unpublished.png", 1),
  );

  assert.equal(value.publicationVersion, 1);
  assert.equal(value.logo?.url, "https://media.example/presentation.png");
});

test("account action text stays readable on both light and dark published colors", () => {
  assert.equal(accountAuthButtonTextColor("#F4C542"), "#000000");
  assert.equal(accountAuthButtonTextColor("#2457D6"), "#FFFFFF");
});

test("account shell loads published fonts and applies their typography settings", () => {
  const { createStorefrontTypographyResources } = componentLoader()<{ createStorefrontTypographyResources: (value: unknown) => unknown }>(new URL("../../../../packages/storefront-design-ui/src/typography.ts", import.meta.url));
  const load = componentLoader({
    "next/link": ({ children, ...props }: Record<string, unknown>) => React.createElement("a", props, children as React.ReactNode),
    "@celebix/storefront-design-ui": { createStorefrontTypographyResources },
  });
  const { AccountAuthShell } = load<{ AccountAuthShell: (props: Record<string, unknown>) => React.ReactNode }>(new URL("./AccountAuthShell.tsx", import.meta.url));
  const published = {
    ...design("#2457D6", "https://media.example/published.png"),
    typography: {
      headingFont: { family: "Playfair Display", category: "serif", availableWeights: ["400", "700"], source: "google" },
      bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "700"], source: "google" },
      headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 17,
    },
  } as PublicStorefrontDesign;
  const rendered = AccountAuthShell({
    storefront: storefront("Mağaza A"), design: published, title: "Giriş", children: React.createElement("p", null, "İçerik"),
  });
  const elements: React.ReactElement[] = [];
  function collect(node: React.ReactNode) {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!React.isValidElement(node)) return;
    elements.push(node);
    collect((node.props as { children?: React.ReactNode }).children);
  }
  collect(rendered);
  const stylesheet = elements.find((element) => element.type === "link" && (element.props as { rel?: string }).rel === "stylesheet");
  const main = elements.find((element) => element.type === "main");
  const style = (main?.props as { style?: Record<string, string> } | undefined)?.style;
  assert.match((stylesheet?.props as { href?: string } | undefined)?.href ?? "", /fonts[.]googleapis[.]com\/css2\?family=Playfair\+Display/u);
  assert.match(style?.["--store-heading-font"] ?? "", /Playfair Display/u);
  assert.match(style?.["--store-body-font"] ?? "", /Inter/u);
  assert.equal(style?.["--auth-action-ink"], "#FFFFFF");
  assert.equal((elements.find((element) => element.type === "img")?.props as { src?: string } | undefined)?.src, "https://media.example/published.png");
});
