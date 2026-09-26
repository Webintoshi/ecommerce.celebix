import { failNextFixtureSave, holdNextFixtureSave, mutateFixture, releaseFixtureSave } from "../../design-settings-fix/fixture-store";
export async function POST(request: Request) {
  const { action } = await request.json();
  if (action === "fail-next-save") failNextFixtureSave();
  else if (action === "hold-next-save") holdNextFixtureSave();
  else if (action === "release-save") releaseFixtureSave();
  else if (action === "remote-edit") {
    await mutateFixture((current) => ({ workspace: { ...current, draftVersion: current.draftVersion + 1, draftUpdatedAt: new Date().toISOString(), draft: { ...current.draft, promotion: { ...current.draft.promotion, headline: "Diğer izole oturumun taslağı" } } }, result: undefined }));
  } else return Response.json({ code: "invalid_input" }, { status: 400 });
  return Response.json({ code: "ok" });
}
