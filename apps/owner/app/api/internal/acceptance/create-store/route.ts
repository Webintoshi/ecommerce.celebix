import { NextResponse } from "next/server";
import {
  authorizeAcceptanceRunner,
  getAcceptanceRunnerAuthContext,
  validateAcceptanceRunnerSlug,
} from "@/lib/acceptance-runner-auth";
import { recordOwnerAuditLog } from "@/lib/control-plane";
import {
  createOwnerStoreWithProvisioning,
  OwnerStoreCreatePreflightError,
  validateOwnerStoreCreatePreflight,
  type OwnerStoreCreateRequestBody,
} from "@/lib/owner-store-create-service";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { isRedisLockError } from "@/lib/redis";

export const dynamic = "force-dynamic";

interface AcceptanceCreateStoreBody {
  slug?: string;
  mode?: string;
  dryRun?: boolean;
  precheckOnly?: boolean;
  execute?: boolean;
}

function buildAcceptanceCreateBody(slug: string): OwnerStoreCreateRequestBody {
  return {
    name: slug,
    slug,
    domain: `${slug}.celebix.site`,
    databaseMode: "light_postgres",
  };
}

async function auditAcceptanceRunner(input: {
  action: string;
  slug: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await recordOwnerAuditLog({
    actorId: null,
    action: input.action,
    targetType: "acceptance_runner",
    targetId: input.slug || "unknown",
    details: input.details ?? {},
  });
}

function isProductReadyAcceptanceMode(value: unknown): boolean {
  return value === "product_ready_acceptance";
}

export async function POST(request: Request) {
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

  let body: AcceptanceCreateStoreBody;

  try {
    body = (await request.json()) as AcceptanceCreateStoreBody;
  } catch {
    return NextResponse.json({ error: "JSON body gerekli." }, { status: 400 });
  }

  const slugPolicy = validateAcceptanceRunnerSlug(body.slug);

  if (!slugPolicy.ok) {
    await auditAcceptanceRunner({
      action: "acceptance_create_denied",
      slug: slugPolicy.slug,
      details: {
        reason: slugPolicy.reason,
        allowedPrefix: slugPolicy.allowedPrefix,
        mode: body.mode ?? null,
      },
    });

    return NextResponse.json(
      {
        error: slugPolicy.message,
        code: slugPolicy.reason,
        allowedPrefix: slugPolicy.allowedPrefix,
      },
      { status: 403 },
    );
  }

  if (!isProductReadyAcceptanceMode(body.mode)) {
    await auditAcceptanceRunner({
      action: "acceptance_create_denied",
      slug: slugPolicy.slug,
      details: {
        reason: "invalid_mode",
        mode: body.mode ?? null,
        allowedPrefix: slugPolicy.allowedPrefix,
      },
    });

    return NextResponse.json(
      {
        error: "Acceptance mode product_ready_acceptance olmali.",
        code: "invalid_mode",
      },
      { status: 403 },
    );
  }

  const previewBlock = blockOwnerActionInPreview("create_store");

  if (previewBlock) {
    await auditAcceptanceRunner({
      action: "acceptance_create_denied",
      slug: slugPolicy.slug,
      details: {
        reason: "preview_block",
        mode: body.mode,
      },
    });

    return previewBlock;
  }

  const createBody = buildAcceptanceCreateBody(slugPolicy.slug);
  const shouldExecute = body.execute === true && body.dryRun !== true && body.precheckOnly !== true;

  if (!shouldExecute) {
    const preflight = await validateOwnerStoreCreatePreflight(createBody);

    await auditAcceptanceRunner({
      action: "acceptance_create_preflight",
      slug: slugPolicy.slug,
      details: {
        dryRun: true,
        mode: body.mode,
        allowed: preflight.ok,
        databaseMode: preflight.databaseMode,
        errorCount: preflight.errors.length,
      },
    });

    return NextResponse.json(
      {
        allowed: preflight.ok,
        dryRun: true,
        slug: slugPolicy.slug,
        databaseMode: preflight.databaseMode,
        preflightErrors: preflight.errors,
      },
      { status: preflight.ok ? 200 : preflight.status },
    );
  }

  try {
    const result = await createOwnerStoreWithProvisioning({
      auth: getAcceptanceRunnerAuthContext(),
      auditActorId: null,
      auditAction: "acceptance_store_created",
      auditDetails: {
        runner: "service_token",
        mode: body.mode,
        allowedPrefix: slugPolicy.allowedPrefix,
      },
      body: createBody,
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof OwnerStoreCreatePreflightError) {
      await auditAcceptanceRunner({
        action: "acceptance_create_denied",
        slug: slugPolicy.slug,
        details: {
          reason: "preflight_failed",
          mode: body.mode,
          errorCount: error.result.errors.length,
        },
      });

      return NextResponse.json(
        {
          error: error.message,
          preflightErrors: error.result.errors,
        },
        { status: error.result.status },
      );
    }

    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Acceptance create baslatilamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
