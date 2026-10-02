import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { resolveAccountAuthBranding } from "./account-auth-branding.ts";
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
  assert.equal(first.logo?.url, "https://media.example/published-a.png");
  assert.equal(second.displayName, "Mağaza B");
  assert.equal(second.logo?.url, "https://media.example/published-b.png");
  assert.notDeepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ["displayName", "logo"]);
});

test("account branding falls back from published logo to presentation logo", () => {
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
});

test("unpublished design never replaces the presentation logo", () => {
  const value = resolveAccountAuthBranding(
    storefront("Başlangıç", "https://media.example/presentation.png"),
    design("#2457D6", "https://media.example/unpublished.png", 1),
  );

  assert.equal(value.logo?.url, "https://media.example/presentation.png");
});

test("account shell keeps the same neutral presentation across tenant colors and typography", () => {
  const load = componentLoader({
    "next/link": ({ children, ...props }: Record<string, unknown>) => React.createElement("a", props, children as React.ReactNode),
  });
  const { AccountAuthShell } = load<{ AccountAuthShell: (props: Record<string, unknown>) => React.ReactNode }>(new URL("./AccountAuthShell.tsx", import.meta.url));
  const published = {
    ...design("#2457D6", "https://media.example/published.png"),
    typography: {
      headingFont: { family: "Playfair Display", category: "serif", availableWeights: ["400", "700"], source: "google" },
      bodyFont: { family: "Lora", category: "serif", availableWeights: ["400", "700"], source: "google" },
      headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 17,
    },
  } as PublicStorefrontDesign;
  function renderElements(name: string, selectedDesign: PublicStorefrontDesign) {
    const elements: React.ReactElement[] = [];
    function collect(node: React.ReactNode) {
      if (Array.isArray(node)) return node.forEach(collect);
      if (!React.isValidElement(node)) return;
      elements.push(node);
      collect((node.props as { children?: React.ReactNode }).children);
    }
    collect(AccountAuthShell({
      storefront: storefront(name), design: selectedDesign, title: "Giriş", children: React.createElement("h1", null, "HOŞ GELDİN."),
    }));
    return elements;
  }
  const variants = [
    renderElements("Mağaza A", published),
    renderElements("Mağaza B", { ...published, brand: { ...published.brand, primaryColor: "#FF0000", backgroundColor: "#111111", textColor: "#FFFF00", fontFamily: "playfair", logo: null } }),
  ];
  for (const elements of variants) {
    const stylesheet = elements.find((element) => element.type === "link" && (element.props as { rel?: string }).rel === "stylesheet");
    assert.equal((stylesheet?.props as { href?: string })?.href, "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap");
    const mainProps = elements.find((element) => element.type === "main")?.props as Record<string, unknown>;
    assert.equal(mainProps.className, "shell");
    assert.equal(mainProps.style, undefined);
    assert.equal(mainProps["data-font"], undefined);
    assert.equal(mainProps["data-published-design"], undefined);
    assert.equal(elements.filter((element) => element.type === "h1").length, 1);
  }
  assert.equal((variants[0]!.find((element) => element.type === "img")?.props as { src?: string })?.src, "https://media.example/published.png");
  const fallbackLink = variants[1]!.find((element) => (element.props as { className?: string }).className === "wordmark");
  assert.equal((fallbackLink?.props as { children?: string })?.children, "Mağaza");
  assert.equal((fallbackLink?.props as { "aria-label"?: string })?.["aria-label"], "Mağaza B ana sayfa");
});
