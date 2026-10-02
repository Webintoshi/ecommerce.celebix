import assert from "node:assert/strict";
import test from "node:test";
import { reviewedSocialUrl, socialProfileAccount, socialProfileUrl } from "./starter-footer-social.ts";

test("account names produce the selected network's safe HTTPS profile", () => {
  const expected = {
    instagram: "https://www.instagram.com/magazam",
    facebook: "https://www.facebook.com/magazam",
    youtube: "https://www.youtube.com/@magazam",
    pinterest: "https://www.pinterest.com/magazam",
    tiktok: "https://www.tiktok.com/@magazam",
    x: "https://www.x.com/magazam",
  } as const;
  for (const [network, url] of Object.entries(expected)) {
    const kind = network as keyof typeof expected;
    assert.equal(socialProfileUrl(kind, " @magazam "), url);
    assert.equal(reviewedSocialUrl(kind, url), url);
    assert.equal(socialProfileAccount(kind, url), "magazam");
  }
});

test("profile review retains exact legacy paths and the existing HTTPS restrictions", () => {
  for (const url of ["https://youtube.com/channel/UC_legacy", "https://www.youtube.com/c/LegacyShop", "https://www.youtube.com/user/LegacyShop", "https://www.youtube.com/@magazam/"]) {
    assert.equal(reviewedSocialUrl("youtube", url), url);
    assert.ok(socialProfileAccount("youtube", url));
  }
  for (const url of ["http://www.instagram.com/shop", "https://www.youtube.com/shop", "https://www.instagram.com:8443/shop", "https://user:secret@www.instagram.com/shop", "https://www.instagram.com/shop?q=1", "https://www.instagram.com/shop#profile", "https://www.instagram.com/", " https://www.instagram.com/shop", "https://www.instagram.com/shop ", "https://www.instagram.com/shop\\next", "https://instagram.com.evil.invalid/shop"]) {
    assert.equal(reviewedSocialUrl("instagram", url), null, url);
  }
});

test("account input cannot create paths, queries, credentials or another host", () => {
  for (const value of ["", "@", "bad/name", "shop?query", "shop#fragment", "user:secret", "https://evil.invalid/shop", "shop\\next", "shop name", "%2Fshop", "shop@host.invalid"]) {
    assert.equal(socialProfileUrl("instagram", value), null, value);
  }
  assert.equal(socialProfileUrl("instagram", "magaza._-1"), "https://www.instagram.com/magaza._-1");
});
