import { NextRequest, NextResponse } from "next/server";
import { createPost } from "@/lib/db/blog";
import {
  buildBlogRowInput,
  mapBlogRowToEditorPost,
  validateBlogEditorInput,
} from "@/lib/blog-editor";
import type { BlogPost } from "@/types/blog";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Blog yazısı kaydedilemedi.";
}

function getErrorStatus(error: unknown): number {
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return 409;
  }

  return 500;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<BlogPost>;
    const validationError = validateBlogEditorInput(payload);

    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const row = await createPost(buildBlogRowInput(payload));

    return NextResponse.json({
      success: true,
      post: mapBlogRowToEditorPost(row),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
