import { parseStorefrontDesignDocument } from "@celebix/saas-contracts";
import { createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";
import { consumeFixtureFailure, mutateFixture, readFixture, waitForFixtureSaveRelease } from "../../../design-settings-fix/fixture-store";
import { designFixturePreviewResources } from "../../../design-settings-fix/preview-resources";

export async function GET() { return Response.json({ code: "found", workspace: await readFixture() }); }
export async function PATCH(request: Request) {
  const input = await request.json();
  if (consumeFixtureFailure()) return Response.json({ code: "unavailable" }, { status: 503 });
  await waitForFixtureSaveRelease();
  return mutateFixture((current) => {
    if (input.expectedDraftVersion !== current.draftVersion) return { result: Response.json({ code: "version_conflict" }, { status: 409 }) };
    const next = { ...current, draft: parseStorefrontDesignDocument(input.design), draftVersion: current.draftVersion + 1, draftUpdatedAt: new Date().toISOString() };
    return { workspace: next, result: Response.json({ code: "saved", result: { draft: next.draft, draftVersion: next.draftVersion, draftUpdatedAt: next.draftUpdatedAt } }) };
  });
}
export async function POST(request: Request) {
  const input = await request.json();
  if (new URL(request.url).pathname === "/api/storefront-design/preview") return Response.json({ code: "ok", resources: await designFixturePreviewResources(await readFixture(), input.composition, input.previewProductId) });
  return mutateFixture((current) => {
    if (input.expectedDraftVersion !== current.draftVersion || input.expectedPublishedVersion !== current.publishedVersion) return { result: Response.json({ code: "version_conflict" }, { status: 409 }) };
    const publishedVersion = current.publishedVersion + 1, publishedAt = new Date().toISOString();
    const published = createPreviewStorefrontDesign({ ...current, publishedVersion, publishedAt });
    return { workspace: { ...current, publishedVersion, publishedAt, published, publishedDraft: current.draft }, result: Response.json({ code: "published", result: { draftVersion: current.draftVersion, publishedVersion, publishedAt, published } }) };
  });
}
