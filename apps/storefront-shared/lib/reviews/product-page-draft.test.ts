import assert from "node:assert/strict";
import test from "node:test";

const ID = "10000000-0000-4000-8000-000000000001";
const OTHER_ID = "10000000-0000-4000-8000-000000000002";
const OP = "20000000-0000-4000-8000-000000000001";
const PATH = "/urun/deri-kordon", NOW = Date.now();
const PREFIX = "celebix_product_review_draft_v1:";
const KEY = `${PREFIX}${ID}`, OTHER_KEY = `${PREFIX}${OTHER_ID}`;
const fields = { reviewerName: " Ada A. ", title: " Güzel ", body: " İyi bir\n  ürün. ", rating: 5 };
const review = { reviewerName: "Ada A.", title: "Güzel", body: "İyi bir ürün.", rating: 5 };

async function helpers() {
  const module = await import("./product-page-draft.ts").catch(() => ({}));
  for (const name of ["readProductReviewDraft", "writeProductReviewDraft", "clearProductReviewDraft"])
    assert.equal(typeof module[name as keyof typeof module], "function", `${name} must be implemented`);
  return module as typeof import("./product-page-draft.ts");
}
function draft(overrides: Record<string, unknown> = {}) {
  return { version: 1, productId: ID, returnTo: PATH, savedAt: NOW, fields: { ...fields }, pending: null, ...overrides };
}
function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

test("partial product drafts preserve raw fields and use only their product storage key", async () => {
  const { readProductReviewDraft, writeProductReviewDraft } = await helpers();
  const storage = memory({ unrelated: "keep", [OTHER_KEY]: "other product" });
  const partial = draft({ fields: { reviewerName: " Ada ", title: "", body: "", rating: 0 } });
  assert.equal(writeProductReviewDraft(storage, partial as never), true);
  assert.deepEqual(readProductReviewDraft(storage, ID, PATH, NOW + 1), partial);
  assert.equal(storage.values.get("unrelated"), "keep");
  assert.equal(storage.values.get(OTHER_KEY), "other product");
  assert.equal(storage.values.size, 3);
  assert.equal(storage.values.has(KEY), true);
  const english = draft({ returnTo: "/products/deri-kordon" });
  assert.equal(writeProductReviewDraft(storage, english as never), true);
  assert.deepEqual(readProductReviewDraft(storage, ID, "/products/deri-kordon", NOW + 1), english);
});

test("draft expiry removes only the scoped draft at thirty minutes and rejects future timestamps", async () => {
  const { readProductReviewDraft, REVIEW_DRAFT_TTL_MS } = await helpers();
  for (const [savedAt, accepted] of [[NOW, true], [NOW - 1_799_999, true], [NOW - 1_800_000, false], [NOW + 1, false], [-1, false], [1.5, false]] as const) {
    const value = draft({ savedAt });
    const storage = memory({ [KEY]: JSON.stringify(value), [OTHER_KEY]: "keep", unrelated: "keep" });
    assert.deepEqual(readProductReviewDraft(storage, ID, PATH, NOW), accepted ? value : null);
    assert.equal(storage.values.has(KEY), accepted);
    assert.equal(storage.values.get(OTHER_KEY), "keep");
    assert.equal(storage.values.get("unrelated"), "keep");
  }
  assert.equal(REVIEW_DRAFT_TTL_MS, 1_800_000);
});

test("foreign product and path drafts cannot be restored on the requested product", async () => {
  const { readProductReviewDraft, writeProductReviewDraft } = await helpers();
  for (const value of [draft({ productId: OTHER_ID }), draft({ returnTo: "/urun/baska-urun" })]) {
    const storage = memory({ [KEY]: JSON.stringify(value), [OTHER_KEY]: "keep" });
    assert.equal(readProductReviewDraft(storage, ID, PATH, NOW), null);
    assert.equal(storage.values.has(KEY), false);
    assert.equal(storage.values.get(OTHER_KEY), "keep");
  }
  for (const returnTo of ["/products", "/account", "//evil.test/urun/a", "https://evil.test/urun/a", "/urun/a?x=1", "/urun/a#review", "/urun/a/../b", "/urun/a%2Fb", "/urun/a\\b", "/urun/a/b", "/urun/a\n", `/urun/${"a".repeat(507)}`]) {
    const storage = memory();
    assert.equal(writeProductReviewDraft(storage, draft({ returnTo }) as never), false, returnTo);
    assert.equal(storage.values.size, 0);
  }
  for (const productId of ["invalid", "../other", "A0000000-0000-4000-8000-000000000001", "00000000-0000-0000-0000-000000000000"]) {
    const storage = memory({ [KEY]: "keep" });
    assert.equal(readProductReviewDraft(storage, productId, PATH, NOW), null);
    assert.equal(writeProductReviewDraft(storage, draft({ productId }) as never), false);
    assert.equal(storage.values.get(KEY), "keep");
  }
});

test("pending submission preserves one operation with a parser-valid payload matching the raw fields", async () => {
  const { readProductReviewDraft, writeProductReviewDraft } = await helpers();
  for (const phase of ["awaiting-auth", "sending", "uncertain"] as const) {
    const value = draft({ pending: { operationId: OP, review, phase } });
    const storage = memory();
    assert.equal(writeProductReviewDraft(storage, value as never), true);
    assert.deepEqual(readProductReviewDraft(storage, ID, PATH, NOW + 1), value);
  }
  const value = draft({ fields: { ...fields, title: "  " }, pending: { operationId: OP, review: { reviewerName: "Ada A.", body: "İyi bir ürün.", rating: 5 }, phase: "awaiting-auth" } });
  const storage = memory();
  assert.equal(writeProductReviewDraft(storage, value as never), true);
  assert.deepEqual(readProductReviewDraft(storage, ID, PATH, NOW + 1), value);
});

test("malformed and tampered drafts never recover authentication data or changed pending payloads", async () => {
  const { readProductReviewDraft, writeProductReviewDraft } = await helpers();
  const pending = { operationId: OP, review, phase: "awaiting-auth" };
  const invalid = [
    draft({ version: 2 }), draft({ phone: "+905551234567" }), draft({ otp: "123456" }), draft({ token: "private" }),
    draft({ fields: { ...fields, phone: "+905551234567" } }), draft({ fields: { ...fields, reviewerName: "a".repeat(121) } }),
    draft({ fields: { ...fields, title: "a".repeat(201) } }), draft({ fields: { ...fields, body: "a".repeat(2001) } }),
    draft({ fields: { ...fields, body: "a\u0000b" } }), draft({ fields: { ...fields, rating: 6 } }),
    draft({ fields: { ...fields, rating: 1.5 } }), draft({ fields: { ...fields, rating: "5" } }),
    draft({ pending: { ...pending, operationId: "invalid" } }), draft({ pending: { ...pending, phase: "submitted" } }),
    draft({ pending: { ...pending, phone: "+905551234567" } }),
    draft({ pending: { ...pending, review: { ...review, customerId: ID } } }),
    draft({ pending: { ...pending, review: { ...review, rating: 0 } } }),
    draft({ pending: { ...pending, review: { ...review, body: "Changed review" } } }),
    draft({ pending: { ...pending, review: { ...review, reviewerName: "Different" } } }),
    draft({ pending: { ...pending, review: { ...review, title: "Different" } } }),
    draft({ pending: { ...pending, review: { ...review, rating: 4 } } }),
    draft({ pending: { ...pending, review: { ...review, body: " İyi bir ürün. " } } }),
  ];
  for (const value of invalid) {
    const storage = memory({ [KEY]: JSON.stringify(value), [OTHER_KEY]: "keep" });
    assert.equal(readProductReviewDraft(storage, ID, PATH, NOW), null, JSON.stringify(value));
    assert.equal(storage.values.has(KEY), false);
    assert.equal(storage.values.get(OTHER_KEY), "keep");
    assert.equal(writeProductReviewDraft(storage, value as never), false);
  }
  for (const value of ["{", "null", "[]", "0", " ".repeat(40_000)]) {
    const storage = memory({ [KEY]: value, unrelated: "keep" });
    assert.equal(readProductReviewDraft(storage, ID, PATH, NOW), null);
    assert.equal(storage.values.has(KEY), false);
    assert.equal(storage.values.get("unrelated"), "keep");
  }
});

test("blocked storage, quota failures and missing or changed readback return safe failure", async () => {
  const { readProductReviewDraft, writeProductReviewDraft, clearProductReviewDraft } = await helpers();
  const fail = () => { throw new Error("storage blocked"); };
  assert.equal(readProductReviewDraft({ getItem: fail, removeItem: fail }, ID, PATH, NOW), null);
  assert.equal(readProductReviewDraft({ getItem: () => "invalid", removeItem: fail }, ID, PATH, NOW), null);
  assert.equal(writeProductReviewDraft({ getItem: fail, setItem: fail }, draft() as never), false);
  assert.equal(writeProductReviewDraft({ getItem: () => null, setItem: fail }, draft() as never), false);
  assert.equal(writeProductReviewDraft({ getItem: () => null, setItem() {} }, draft() as never), false);
  assert.equal(writeProductReviewDraft({ getItem: () => JSON.stringify(draft({ fields: { ...fields, rating: 4 } })), setItem() {} }, draft() as never), false);
  assert.equal(writeProductReviewDraft({ getItem: fail, setItem() {} }, draft() as never), false);
  assert.equal(clearProductReviewDraft({ removeItem: fail }, ID), false);
});

test("a storage read failure preserves an existing draft until it can be read", async () => {
  const { readProductReviewDraft } = await helpers();
  const stored = JSON.stringify(draft()), storage = memory({ [KEY]: stored });
  assert.equal(readProductReviewDraft({ ...storage, getItem() { throw new Error("temporarily blocked"); } }, ID, PATH, NOW), null);
  assert.equal(storage.values.get(KEY), stored);
});

test("clearing a draft removes only its valid product key", async () => {
  const { clearProductReviewDraft } = await helpers();
  const storage = memory({ [KEY]: "draft", [OTHER_KEY]: "keep", unrelated: "keep" });
  assert.equal(clearProductReviewDraft(storage, ID), true);
  assert.deepEqual(Object.fromEntries(storage.values), { [OTHER_KEY]: "keep", unrelated: "keep" });
  assert.equal(clearProductReviewDraft(storage, "../other"), false);
  assert.equal(clearProductReviewDraft(storage, OTHER_ID), true);
  assert.equal(storage.values.get("unrelated"), "keep");
});
