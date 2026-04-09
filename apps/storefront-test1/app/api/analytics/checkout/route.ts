import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/analytics/checkout - Track checkout progress
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, step, cartItems, cartTotal, email, phone } = body;

        if (!sessionId || !cartItems) {
            return NextResponse.json({ success: false, error: "Session ID and cart items required" }, { status: 400 });
        }

        const supabase = createServerClient();

        // Check if checkout session exists
        const { data: existing } = await supabase
            .from("checkout_sessions")
            .select("id")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (existing) {
            // Update existing checkout session
            await supabase
                .from("checkout_sessions")
                .update({
                    step: step || "info",
                    cart_items: cartItems,
                    cart_total: cartTotal,
                    email: email,
                    phone: phone,
                    updated_at: new Date().toISOString(),
                    abandoned: false, // Reset abandoned status if user returns
                })
                .eq("id", existing.id);
        } else {
            // Create new checkout session
            await supabase.from("checkout_sessions").insert({
                session_id: sessionId,
                step: step || "info",
                cart_items: cartItems,
                cart_total: cartTotal,
                email: email,
                phone: phone,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        // Also track as event
        await supabase.from("events").insert({
            session_id: sessionId,
            event_type: step === "complete" ? "purchase" : "checkout_step",
            event_data: { step, cartTotal },
            page_url: "/odeme",
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Checkout tracking error:", error);
        return NextResponse.json({ success: true });
    }
}

// PUT /api/analytics/checkout - Complete checkout
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, orderId } = body;

        if (!sessionId) {
            return NextResponse.json({ success: false, error: "Session ID required" }, { status: 400 });
        }

        const supabase = createServerClient();

        // Mark checkout as complete
        await supabase
            .from("checkout_sessions")
            .update({
                step: "complete",
                order_id: orderId,
                updated_at: new Date().toISOString(),
            })
            .eq("session_id", sessionId)
            .is("order_id", null);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Checkout complete error:", error);
        return NextResponse.json({ success: true });
    }
}
