import { NextRequest, NextResponse } from "next/server";
import {
  deleteCustomer,
  getCustomerByEmail,
  getCustomerById,
  getCustomerStats,
  getCustomers,
  getOrCreateCustomer,
  replaceCustomerAddresses,
  updateCustomer,
} from "@/lib/db/customers";

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  );
}

function buildCustomerUpdatePayload(updates: Record<string, unknown>) {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName || null;
  if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName || null;
  if (updates.email !== undefined) dbUpdates.email = updates.email || null;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
  if (updates.status !== undefined) dbUpdates.status = updates.status || "active";
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
  if (updates.totalOrders !== undefined) dbUpdates.total_orders = updates.totalOrders;
  if (updates.totalSpent !== undefined) dbUpdates.total_spent = updates.totalSpent;
  if (updates.externalCustomerId !== undefined) {
    dbUpdates.external_customer_id = updates.externalCustomerId || null;
  }
  if (updates.acceptsEmailMarketing !== undefined) {
    dbUpdates.accepts_email_marketing = updates.acceptsEmailMarketing;
  }
  if (updates.acceptsSmsMarketing !== undefined) {
    dbUpdates.accepts_sms_marketing = updates.acceptsSmsMarketing;
  }
  if (updates.taxExempt !== undefined) {
    dbUpdates.tax_exempt = updates.taxExempt;
  }

  const normalizedTags = normalizeTags(updates.tags);
  if (normalizedTags !== undefined) {
    dbUpdates.tags = normalizedTags;
  }

  return dbUpdates;
}

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
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return NextResponse.json({ success: true, customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch customers" },
      { status: 500 },
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
      status: body.status,
      notes: body.notes,
      totalOrders: body.totalOrders,
      totalSpent: body.totalSpent,
      tags: normalizeTags(body.tags),
      externalCustomerId: body.externalCustomerId,
      acceptsEmailMarketing: body.acceptsEmailMarketing,
      acceptsSmsMarketing: body.acceptsSmsMarketing,
      taxExempt: body.taxExempt,
    });

    if (Array.isArray(body.addresses)) {
      await replaceCustomerAddresses(customer.id, body.addresses);
    }

    const fullCustomer = await getCustomerById(customer.id);
    return NextResponse.json({ success: true, customer: fullCustomer });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create customer" },
      { status: 500 },
    );
  }
}

// PUT /api/customers - Update customer
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, addresses, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Customer ID is required" }, { status: 400 });
    }

    const dbUpdates = buildCustomerUpdatePayload(updates);

    if (Object.keys(dbUpdates).length > 0) {
      await updateCustomer(id, dbUpdates);
    }

    if (Array.isArray(addresses)) {
      await replaceCustomerAddresses(id, addresses);
    }

    const customer = await getCustomerById(id);
    return NextResponse.json({ success: true, customer });
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update customer" },
      { status: 500 },
    );
  }
}

// DELETE /api/customers - Delete customer
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Customer ID is required" }, { status: 400 });
    }

    await deleteCustomer(id);
    return NextResponse.json({ success: true, message: "Customer deleted" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete customer" },
      { status: 500 },
    );
  }
}
