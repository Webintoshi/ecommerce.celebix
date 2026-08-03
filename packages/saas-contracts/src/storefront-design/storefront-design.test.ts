import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublicStorefrontDesign,
  parseStorefrontDesignDocument,
  parseStorefrontDesignWorkspace,
} from "./validation.ts";

const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";

const DESIGN = {
  schemaVersion: 1,
  brand: {
    logo: { kind: "media", mediaId: MEDIA_ID },
    favicon: null,
    primaryColor: "#FF5A00",
    accentColor: "#171717",
    backgroundColor: "#FFFFFF",
    textColor: "#171717",
    fontFamily: "inter",
  },
  hero: {
    headline: "Zarafetin ışıltısı",
    body: "Her anınıza değer katan zamansız tasarımlar.",
    image: { kind: "media", mediaId: MEDIA_ID },
    destination: { kind: "product", resourceId: PRODUCT_ID },
    enabled: true,
  },
  promotion: {
    headline: "Ücretsiz kargo",
    body: "Tüm siparişlerde geçerli.",
    destination: { kind: "none" },
    startsAt: "2026-08-03T09:00:00.000Z",
    endsAt: "2026-08-31T20:59:59.000Z",
    enabled: true,
  },
  announcement: {
    items: ["Tüm siparişlerde ücretsiz kargo", "14 gün içinde iade"],
    icon: "truck",
    speed: "normal",
    direction: "left",
    animation: "continuous",
    enabled: true,
  },
} as const;

const PUBLIC_DESIGN = {
  schemaVersion: 1,
  publicationVersion: 3,
  publishedAt: "2026-08-03T10:00:00.000Z",
  brand: {
    logo: {
      url: `https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/design/${MEDIA_ID}.webp`,
      altText: "Güzide Kuyumcu",
    },
    favicon: null,
    primaryColor: "#FF5A00",
    accentColor: "#171717",
    backgroundColor: "#FFFFFF",
    textColor: "#171717",
    fontFamily: "inter",
  },
  hero: {
    headline: "Zarafetin ışıltısı",
    body: "Her anınıza değer katan zamansız tasarımlar.",
    image: {
      url: `https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/design/${MEDIA_ID}.webp`,
      altText: "Altın kolye ve yüzük",
    },
    destination: { path: `/products/${PRODUCT_ID}` },
    enabled: true,
  },
  promotion: {
    headline: "Ücretsiz kargo",
    body: "Tüm siparişlerde geçerli.",
    destination: null,
    startsAt: "2026-08-03T09:00:00.000Z",
    endsAt: "2026-08-31T20:59:59.000Z",
    enabled: true,
  },
  announcement: DESIGN.announcement,
} as const;

const WORKSPACE = {
  schemaVersion: 1,
  draftVersion: 4,
  publishedVersion: 3,
  draftUpdatedAt: "2026-08-03T10:01:00.000Z",
  publishedAt: "2026-08-03T10:00:00.000Z",
  draft: DESIGN,
  published: PUBLIC_DESIGN,
  store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" },
  media: [{ id: MEDIA_ID, url: PUBLIC_DESIGN.brand.logo.url, altText: "Güzide Kuyumcu", mediaType: "image/webp", width: 1200, height: 600 }],
  destinations: [{ kind: "product", resourceId: PRODUCT_ID, label: "Pırlanta Kolye", path: `/products/${PRODUCT_ID}` }],
} as const;

test("design contract accepts one complete version-one document", () => {
  assert.deepEqual(parseStorefrontDesignDocument(DESIGN), DESIGN);
  assert.equal(Object.isFrozen(parseStorefrontDesignDocument(DESIGN).announcement.items), true);
});

test("design contract rejects unknown fields, unsafe values, invalid schedules, and hostile shapes", () => {
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, tenantId: PRODUCT_ID }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, brand: { ...DESIGN.brand, primaryColor: "orange" } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, headline: "Güvenli\u0000değil" } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, promotion: { ...DESIGN.promotion, startsAt: DESIGN.promotion.endsAt, endsAt: DESIGN.promotion.startsAt } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, announcement: { ...DESIGN.announcement, items: new Array(2) } }));

  const accessor = { ...DESIGN } as Record<string, unknown>;
  Object.defineProperty(accessor, "brand", { enumerable: true, get: () => DESIGN.brand });
  assert.throws(() => parseStorefrontDesignDocument(accessor));
});

test("admin writes reject legacy remote images", () => {
  assert.throws(() => parseStorefrontDesignDocument({
    ...DESIGN,
    hero: { ...DESIGN.hero, image: { kind: "legacy_https", url: "https://legacy.example/hero.jpg" } },
  }));
});

test("public contract resolves media and destinations without draft or private identifiers", () => {
  assert.deepEqual(parsePublicStorefrontDesign(PUBLIC_DESIGN), PUBLIC_DESIGN);
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, draftVersion: 2 }));
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, hero: { ...PUBLIC_DESIGN.hero, mediaId: MEDIA_ID } }));
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, hero: { ...PUBLIC_DESIGN.hero, destination: { path: "https://evil.example/" } } }));
});

test("authenticated workspace keeps exact tenant choices and versioned state", () => {
  assert.deepEqual(parseStorefrontDesignWorkspace(WORKSPACE), WORKSPACE);
  assert.throws(() => parseStorefrontDesignWorkspace({ ...WORKSPACE, storeId: PRODUCT_ID }));
  assert.throws(() => parseStorefrontDesignWorkspace({ ...WORKSPACE, destinations: [{ ...WORKSPACE.destinations[0], kind: "none" }] }));
});
