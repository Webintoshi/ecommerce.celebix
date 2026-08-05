import assert from "node:assert/strict";
import test from "node:test";

import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { resolveAccountAuthBranding } from "./account-auth-branding.ts";

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
  assert.equal(first.brandForeground, "#FFFFFF");
  assert.equal(first.logo?.url, "https://media.example/published-a.png");
  assert.equal(second.displayName, "Mağaza B");
  assert.equal(second.primaryColor, "#F4C542");
  assert.equal(second.brandForeground, "#000000");
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
