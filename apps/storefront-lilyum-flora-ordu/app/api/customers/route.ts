import { NextRequest, NextResponse } from "next/server";
import {
    getCustomers,
    getCustomerById,
    getCustomerByEmail,
    getOrCreateCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerStats,
    addAddress,
    updateAddress,
    deleteAddress
} from "@/lib/db/customers";

// GET /api/customers - Get customers
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        const email = searchParams.get("email");
        const stats = searchParams.get("stats");
        const search = searchParams.get("search");
        const limit = searchParams.get("limit");
        const offset = searchParams.get("offset");

        if (stats === "true") {
            const customerStats = await getCustomerStats();
            return NextResponse.json({ success: true, stats: customerStats });
        }

        if (id) {
            const customer = await getCustomerById(id);
            return NextResponse.json({ success: true, customer });
        }

        if (email) {
            const customer = await getCustomerByEmail(email);
            return NextResponse.json({ success: true, customer });
        }

        const customers = await getCustomers({
            search: search || undefined,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
        });

        return NextResponse.json({ success: true, customers });
    } catch (error) {
        console.error("Error fetching customers:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch customers" },
            { status: 500 }
        );
    }
}

// POST /api/customers - Create or get customer
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const customer = await getOrCreateCustomer({
            email: body.email,
            phone: body.phone,
            firstName: body.firstName,
            lastName: body.lastName,
        });

        return NextResponse.json({ success: true, customer });
    } catch (error) {
        console.error("Error creating customer:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to create customer" },
            { status: 500 }
        );
    }
}

// PUT /api/customers - Update customer
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Customer ID is required" },
                { status: 400 }
            );
        }

        // Map frontend field names to database field names
        const dbUpdates: any = {};
        if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
        if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.totalOrders !== undefined) dbUpdates.total_orders = updates.totalOrders;
        if (updates.totalSpent !== undefined) dbUpdates.total_spent = updates.totalSpent;

        const customer = await updateCustomer(id, dbUpdates);
        return NextResponse.json({ success: true, customer });
    } catch (error) {
        console.error("Error updating customer:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to update customer" },
            { status: 500 }
        );
    }
}

// DELETE /api/customers - Delete customer
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Customer ID is required" },
                { status: 400 }
            );
        }

        await deleteCustomer(id);
        return NextResponse.json({ success: true, message: "Customer deleted" });
    } catch (error) {
        console.error("Error deleting customer:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to delete customer" },
            { status: 500 }
        );
    }
}
