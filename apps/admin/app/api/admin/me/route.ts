import { NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";

export async function GET() {
  try {
    const auth = await getAdminAuthContext();

    if (!auth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      provider: auth.provider,
      authSource: auth.authSource,
      profile: {
        id: auth.profile.id,
        email: auth.profile.email,
        full_name: auth.profile.full_name,
        role: auth.profile.role,
        task_definition: auth.profile.task_definition,
      },
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch admin profile" },
      { status: 500 },
    );
  }
}
