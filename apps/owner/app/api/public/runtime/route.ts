import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    app: "owner",
    generatedAt: new Date().toISOString(),
    capabilities: {
      publicRuntime: true,
      canonicalSupabaseProvisioning: true,
      coolifyStartDeploy: true,
      secretAuthorityRepair: true,
    },
  });
}
