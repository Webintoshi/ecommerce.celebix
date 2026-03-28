import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

const SETTINGS_KEY = "customer_segments";

const segmentFieldSchema = z.enum([
  "totalSpent",
  "totalOrders",
  "averageOrderValue",
  "lastOrderDays",
  "registeredDays",
  "status",
]);

const segmentOperatorSchema = z.enum([
  ">",
  "<",
  ">=",
  "<=",
  "=",
  "contains",
  "not_contains",
]);

const segmentConditionSchema = z.object({
  field: segmentFieldSchema,
  operator: segmentOperatorSchema,
  value: z.union([z.string(), z.number()]),
});

const segmentInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  logic: z.enum(["all", "any"]).default("all"),
  conditions: z.array(segmentConditionSchema).min(1).max(10),
});

const segmentSchema = segmentInputSchema.extend({
  id: z.string().min(3).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

type Segment = z.infer<typeof segmentSchema>;

const DEFAULT_SEGMENTS: Segment[] = [
  {
    id: "default-vip",
    name: "VIP Müşteriler",
    description: "Toplam harcaması yüksek, tekrar satın alma potansiyeli güçlü müşteriler.",
    logic: "all",
    conditions: [
      {
        field: "totalSpent",
        operator: ">=",
        value: 5000,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-yeni",
    name: "Yeni Müşteriler",
    description: "Son 30 gün içerisinde sisteme kayıt olmuş müşteriler.",
    logic: "all",
    conditions: [
      {
        field: "registeredDays",
        operator: "<=",
        value: 30,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-kayip",
    name: "Kaybedilmek Üzere",
    description: "Uzun süredir sipariş vermemiş müşteriler için geri kazanım segmenti.",
    logic: "all",
    conditions: [
      {
        field: "lastOrderDays",
        operator: ">=",
        value: 90,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

async function getSegmentsFromStore(): Promise<Segment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .single();

  if (error || !data?.value) {
    return DEFAULT_SEGMENTS;
  }

  const rawValue = data.value as unknown;
  const rawSegments = Array.isArray(rawValue)
    ? rawValue
    : Array.isArray((rawValue as { segments?: unknown[] })?.segments)
      ? (rawValue as { segments: unknown[] }).segments
      : [];

  const parsedSegments = rawSegments
    .map((item) => segmentSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (parsedSegments.length === 0) {
    return DEFAULT_SEGMENTS;
  }

  return parsedSegments;
}

async function saveSegmentsToStore(segments: Segment[]) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("settings")
    .upsert(
      {
        key: SETTINGS_KEY,
        value: { segments },
      },
      { onConflict: "key" }
    );

  if (error) {
    throw error;
  }
}

function createId() {
  return `seg-${crypto.randomUUID()}`;
}

export async function GET() {
  try {
    const segments = await getSegmentsFromStore();
    return NextResponse.json({ success: true, segments });
  } catch (error) {
    console.error("Error fetching customer segments:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Segmentler alınamadı.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = segmentInputSchema.safeParse(body?.segment);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Geçersiz segment verisi." },
        { status: 422 }
      );
    }

    const segments = await getSegmentsFromStore();
    const exists = segments.some(
      (segment) => segment.name.toLowerCase() === parsed.data.name.toLowerCase()
    );

    if (exists) {
      return NextResponse.json(
        { success: false, error: "Aynı isimde bir segment zaten var." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const newSegment: Segment = {
      id: createId(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };

    const updatedSegments = [newSegment, ...segments];
    await saveSegmentsToStore(updatedSegments);

    return NextResponse.json({ success: true, segment: newSegment, segments: updatedSegments });
  } catch (error) {
    console.error("Error creating customer segment:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Segment oluşturulamadı.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body?.id as string | undefined;
    const parsed = segmentInputSchema.safeParse(body?.segment);

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Segment ID gerekli." },
        { status: 400 }
      );
    }

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Geçersiz segment verisi." },
        { status: 422 }
      );
    }

    const segments = await getSegmentsFromStore();
    const target = segments.find((segment) => segment.id === id);

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Segment bulunamadı." },
        { status: 404 }
      );
    }

    const duplicateName = segments.some(
      (segment) =>
        segment.id !== id && segment.name.toLowerCase() === parsed.data.name.toLowerCase()
    );

    if (duplicateName) {
      return NextResponse.json(
        { success: false, error: "Aynı isimde bir segment zaten var." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const updatedSegments = segments.map((segment) =>
      segment.id === id
        ? {
          ...segment,
          ...parsed.data,
          updatedAt: now,
        }
        : segment
    );

    await saveSegmentsToStore(updatedSegments);
    return NextResponse.json({ success: true, segments: updatedSegments });
  } catch (error) {
    console.error("Error updating customer segment:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Segment güncellenemedi.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Segment ID gerekli." },
        { status: 400 }
      );
    }

    const segments = await getSegmentsFromStore();
    const updatedSegments = segments.filter((segment) => segment.id !== id);

    if (updatedSegments.length === segments.length) {
      return NextResponse.json(
        { success: false, error: "Segment bulunamadı." },
        { status: 404 }
      );
    }

    await saveSegmentsToStore(updatedSegments);
    return NextResponse.json({ success: true, segments: updatedSegments });
  } catch (error) {
    console.error("Error deleting customer segment:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Segment silinemedi.",
      },
      { status: 500 }
    );
  }
}
