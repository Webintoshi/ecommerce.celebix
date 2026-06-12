import { NextResponse } from "next/server";
import { authorizeAcceptanceRunner } from "@/lib/acceptance-runner-auth";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { runExistingStoreSmokeRefresh } from "@/lib/existing-store-smoke-refresh";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

interface SmokeRefreshBody {
  dryRun?: boolean;
  updateMetadata?: boolean;
  timeoutMs?: number;
}

function readTimeoutMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(value), 1_000), 20_000);
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = authorizeAcceptanceRunner(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.message,
        code: auth.code,
      },
      { status: auth.status },
    );
  }

  const body = (await request.json().catch(() => ({}))) as SmokeRefreshBody;
  const dryRun = body.dryRun === true;
  const updateMetadata = body.updateMetadata !== false;

  if (!dryRun && updateMetadata) {
    const previewBlock = blockOwnerActionInPreview("write");

    if (previewBlock) {
      return previewBlock;
    }
  }

  try {
    const { slug } = await params;
    const result = await runExistingStoreSmokeRefresh(slug, {
      dryRun,
      updateMetadata,
      timeoutMs: readTimeoutMs(body.timeoutMs),
    });

    return NextResponse.json(
      {
        slug: result.slug,
        dryRun: result.dryRun,
        metadataUpdated: result.metadataUpdated,
        ownerRowUpdated: result.ownerRowUpdated,
        overallStatus: result.report.overallStatus,
        failedSteps: result.report.checks
          .filter((check) => check.status === "failed")
          .map((check) => ({
            id: check.id,
            label: check.label,
            category: check.category,
            statusCode: check.statusCode,
            errorCode: check.errorCode,
            message: check.message,
          })),
        readiness: result.readinessPreview,
        finishedAt: result.report.finishedAt ?? null,
      },
      { status: result.report.overallStatus === "failed" ? 409 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Smoke metadata refresh basarisiz oldu.";
    const status = /prefix|slug|bulunamadi|bulunamadı|forbidden|kabul/i.test(message) ? 403 : 500;

    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
