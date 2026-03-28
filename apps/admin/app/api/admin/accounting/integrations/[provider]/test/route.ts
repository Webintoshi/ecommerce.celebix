import { NextResponse } from "next/server";
import { isAccountingProvider } from "@/lib/accounting-providers";
import { testAccountingConnection } from "@/lib/db/accounting";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(_: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const result = await testAccountingConnection(provider);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Accounting connection test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Baglanti testi basarisiz.",
      },
      { status: 500 },
    );
  }
}

