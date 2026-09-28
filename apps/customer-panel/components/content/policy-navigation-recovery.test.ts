import assert from "node:assert/strict";
import test from "node:test";

import {
  forgetPolicyNavigationDrafts,
  readPolicyNavigationDrafts,
  retainPolicyNavigationDrafts,
  type RetainedPolicyDraft,
} from "./policy-navigation-recovery.ts";

const DRAFT: RetainedPolicyDraft = {
  key: "kvkk", body: "Korunacak metin", status: "published", recovery: "conflict", version: 4,
};

test("navigation drafts stay isolated between session and store scopes", () => {
  const first = "policy-isolation-session-store-a";
  const second = "policy-isolation-session-store-b";
  try {
    retainPolicyNavigationDrafts(first, [DRAFT]);
    retainPolicyNavigationDrafts(second, [{ ...DRAFT, body: "Diğer mağazanın metni", recovery: "unknown", version: 7 }]);
    assert.deepEqual(readPolicyNavigationDrafts(first), [
      { key: "kvkk", body: "Korunacak metin", status: "published", recovery: "conflict", version: 4 },
    ]);
    assert.deepEqual(readPolicyNavigationDrafts(second), [
      { key: "kvkk", body: "Diğer mağazanın metni", status: "published", recovery: "unknown", version: 7 },
    ]);
    assert.deepEqual(readPolicyNavigationDrafts("policy-isolation-missing"), []);
  } finally {
    forgetPolicyNavigationDrafts(first);
    forgetPolicyNavigationDrafts(second);
  }
});

test("retained input and returned snapshots cannot mutate the recovery cache", () => {
  const scope = "policy-copy-session-store";
  const input = [{ ...DRAFT }];
  try {
    retainPolicyNavigationDrafts(scope, input);
    input[0].body = "Caller changed input";
    input.push({ ...DRAFT, key: "membership" });
    const first = readPolicyNavigationDrafts(scope);
    assert.equal(first.length, 1);
    assert.equal(first[0].body, "Korunacak metin");
    const second = readPolicyNavigationDrafts(scope);
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    assert.throws(() => { (first as RetainedPolicyDraft[]).push(DRAFT); }, TypeError);
    assert.throws(() => { (first[0] as { body: string }).body = "Caller changed output"; }, TypeError);
    assert.equal(readPolicyNavigationDrafts(scope)[0].body, "Korunacak metin");
  } finally {
    forgetPolicyNavigationDrafts(scope);
  }
});

test("new retained scopes evict the oldest while renewed drafts keep their slot", () => {
  const scopes = Array.from({ length: 9 }, (_, index) => `policy-eviction-${index}`);
  try {
    for (const scope of scopes.slice(0, 8)) retainPolicyNavigationDrafts(scope, [DRAFT]);
    retainPolicyNavigationDrafts(scopes[0], [{ ...DRAFT, body: "Yenilenen taslak" }]);
    retainPolicyNavigationDrafts(scopes[8], [DRAFT]);
    assert.deepEqual(readPolicyNavigationDrafts(scopes[1]), []);
    const renewed = readPolicyNavigationDrafts(scopes[0]);
    assert.equal(renewed.length, 1);
    assert.equal(renewed[0].body, "Yenilenen taslak");
    for (const scope of scopes.slice(2)) assert.equal(readPolicyNavigationDrafts(scope).length, 1);
  } finally {
    for (const scope of scopes) forgetPolicyNavigationDrafts(scope);
  }
});

test("explicit discard and empty retention remove only the selected scope", () => {
  const first = "policy-clear-session-store-a";
  const second = "policy-clear-session-store-b";
  try {
    retainPolicyNavigationDrafts(first, [DRAFT]);
    retainPolicyNavigationDrafts(second, [DRAFT]);
    forgetPolicyNavigationDrafts(first);
    assert.deepEqual(readPolicyNavigationDrafts(first), []);
    assert.equal(readPolicyNavigationDrafts(second).length, 1);
    retainPolicyNavigationDrafts(second, []);
    assert.deepEqual(readPolicyNavigationDrafts(second), []);
  } finally {
    forgetPolicyNavigationDrafts(first);
    forgetPolicyNavigationDrafts(second);
  }
});

test("missing scopes never retain or expose navigation drafts", () => {
  retainPolicyNavigationDrafts(undefined, [DRAFT]);
  forgetPolicyNavigationDrafts(undefined);
  assert.deepEqual(readPolicyNavigationDrafts(undefined), []);
  retainPolicyNavigationDrafts("", [DRAFT]);
  assert.deepEqual(readPolicyNavigationDrafts(""), []);
});
