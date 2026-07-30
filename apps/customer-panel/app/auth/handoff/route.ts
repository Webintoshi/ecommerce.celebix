import { handleDefaultCrossHostHandoff } from "../../../lib/cross-host-handoff-default.ts";

export async function POST(request: Request) {
  return handleDefaultCrossHostHandoff(request);
}
