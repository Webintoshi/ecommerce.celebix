import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select("id,email,first_name,last_name,tags,accepts_email_marketing,created_at")
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      throw error;
    }

    const recipients = (data || [])
      .filter((customer) => typeof customer.email === "string" && customer.email.trim().length > 0)
      .map((customer) => ({
        id: String(customer.id),
        email: String(customer.email || "").trim(),
        firstName: String(customer.first_name || "").trim(),
        lastName: String(customer.last_name || "").trim(),
        tags: Array.isArray(customer.tags) ? customer.tags.map((tag) => String(tag)) : [],
        acceptsEmailMarketing: Boolean(customer.accepts_email_marketing),
        createdAt: String(customer.created_at || new Date().toISOString()),
      }));

    return NextResponse.json({
      success: true,
      recipients,
    });
  } catch (error) {
    console.error("Error loading marketing recipients:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Müşteri listesi yüklenemedi.",
      },
      { status: 500 },
    );
  }
}
