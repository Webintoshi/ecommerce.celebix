import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, first_name, last_name, phone, user_id } = await request.json();

    const supabase = createServerClient();

    // Check if customer already exists with this email
    const { data: existingByEmail } = await supabase
      .from("customers")
      .select("*")
      .eq("email", email)
      .single();

    if (existingByEmail) {
      // If user_id is provided and customer doesn't have one, update it
      if (user_id && !existingByEmail.user_id) {
        const { data: updated, error: updateError } = await supabase
          .from("customers")
          .update({ 
            user_id,
            first_name: first_name || existingByEmail.first_name,
            last_name: last_name || existingByEmail.last_name,
            phone: phone || existingByEmail.phone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingByEmail.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }

        return NextResponse.json({ customer: updated, updated: true }, { status: 200 });
      }

      return NextResponse.json({ customer: existingByEmail, exists: true }, { status: 200 });
    }

    // Check if customer exists with this user_id
    if (user_id) {
      const { data: existingByUserId } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user_id)
        .single();

      if (existingByUserId) {
        return NextResponse.json({ customer: existingByUserId, exists: true }, { status: 200 });
      }
    }

    // Create new customer
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        email,
        first_name: first_name || "",
        last_name: last_name || "",
        phone: phone || "",
        user_id: user_id || null,
        status: "active",
        total_orders: 0,
        total_spent: 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ customer, created: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
