import { parseStorefrontDesignDocument } from "@celebix/saas-contracts";
import { createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";
import { consumeFixtureFailure, readFixture, waitForFixtureSaveRelease, writeFixture } from "../../../design-settings-fix/fixture-store";

export async function GET() { return Response.json({ code: "found", workspace: await readFixture() }); }
export async function PATCH(request: Request) {
  const input = await request.json();
  if (consumeFixtureFailure()) return Response.json({ code: "unavailable" }, { status: 503 });
  await waitForFixtureSaveRelease();
  const current = await readFixture();
  if (input.expectedDraftVersion !== current.draftVersion) return Response.json({ code: "version_conflict" }, { status: 409 });
  const next = { ...current, draft: parseStorefrontDesignDocument(input.design), draftVersion: current.draftVersion + 1, draftUpdatedAt: new Date().toISOString() };
  await writeFixture(next);
  return Response.json({ code: "saved", result: { draft: next.draft, draftVersion: next.draftVersion, draftUpdatedAt: next.draftUpdatedAt } });
}
export async function POST(request: Request) {
  const input = await request.json();
  const current = await readFixture();
  if (input.expectedDraftVersion !== current.draftVersion || input.expectedPublishedVersion !== current.publishedVersion) return Response.json({ code: "version_conflict" }, { status: 409 });
  const publishedVersion = current.publishedVersion + 1, publishedAt = new Date().toISOString();
  const published = createPreviewStorefrontDesign({ ...current, publishedVersion, publishedAt });
  await writeFixture({ ...current, publishedVersion, publishedAt, published });
  return Response.json({ code: "published", result: { draftVersion: current.draftVersion, publishedVersion, publishedAt, published } });
}
