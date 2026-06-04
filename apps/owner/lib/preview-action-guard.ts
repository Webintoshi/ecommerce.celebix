import "server-only";

import { NextResponse } from "next/server";
import {
  getOwnerActionDisabledPayload,
  type OwnerPreviewAction,
} from "@/lib/preview-mode";

export function blockOwnerActionInPreview(action: OwnerPreviewAction) {
  const payload = getOwnerActionDisabledPayload(action);

  if (!payload) {
    return null;
  }

  return NextResponse.json(
    {
      error: payload.message,
      code: payload.code,
    },
    { status: 403 },
  );
}
