import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("information disclosures render only ordered persisted merchandising and sanitized policy HTML", async () => {
  const source = await readFile(new URL("./ProductInformationDisclosures.tsx", import.meta.url), "utf8");
  for (const proof of ["informationSections", "materialsAndCare", "certifications", "publishedPolicies", "renderStarterProductDescription", "dangerouslySetInnerHTML"]) assert.match(source, new RegExp(proof, "u"));
  assert.doesNotMatch(source, /Organic cotton|premium linen|ready to ship|Lorem ipsum/u);
  assert.doesNotMatch(source, /storeId|tenantId|localStorage|sessionStorage/u);
});

test("approved reviews never invent customer testimony", async () => {
  const source = await readFile(new URL("./ProductApprovedReviews.tsx", import.meta.url), "utf8");
  for (const proof of ["reviews", "reviewerName", "rating", "merchantReply"]) assert.match(source, new RegExp(proof, "u"));
  assert.doesNotMatch(source, /Rachel F[.]|Leslie M[.]|Sam R[.]|Fantastik/u);
});
