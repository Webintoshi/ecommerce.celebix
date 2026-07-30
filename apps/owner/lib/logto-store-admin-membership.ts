import type { PostgresQuery } from "./postgres-transaction";

export type StoreAdminRole =
  | "super_admin"
  | "product_manager"
  | "content_creator"
  | "order_manager";

export async function persistLogtoStoreAdminMembership(input: {
  query: PostgresQuery;
  subject: string;
  email: string;
  fullName: string | null;
  storeSlug: string;
  role: StoreAdminRole;
  taskDefinition: string | null;
}): Promise<{ principalId: string }> {
  const principalRows = await input.query<{ principal_id: string }>(
    `
      INSERT INTO public.auth_principals (
        provider,
        subject,
        email,
        role,
        status,
        metadata
      )
      VALUES (
        'logto',
        $1,
        $2,
        'admin',
        'active',
        jsonb_build_object('fullName', $3::text)
      )
      ON CONFLICT (provider, subject)
      DO UPDATE SET
        email = EXCLUDED.email,
        role = 'admin',
        status = 'active',
        metadata = public.auth_principals.metadata || EXCLUDED.metadata,
        updated_at = now()
      RETURNING id::text AS principal_id;
    `,
    [input.subject, input.email, input.fullName],
  );

  const principalId = principalRows[0]?.principal_id;
  if (!principalId) {
    throw new Error("Store admin principal could not be persisted");
  }

  await input.query(
    `
      UPDATE public.auth_store_memberships
      SET status = 'inactive', updated_at = now()
      WHERE principal_id = $1::uuid
        AND store_slug = $2
        AND role <> $3
        AND status = 'active';
    `,
    [principalId, input.storeSlug, input.role],
  );

  await input.query(
    `
      INSERT INTO public.auth_store_memberships (
        principal_id,
        store_slug,
        role,
        status,
        metadata
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        'active',
        jsonb_build_object('taskDefinition', $4::text)
      )
      ON CONFLICT (principal_id, store_slug, role)
      DO UPDATE SET
        status = 'active',
        metadata = EXCLUDED.metadata,
        updated_at = now();
    `,
    [principalId, input.storeSlug, input.role, input.taskDefinition],
  );

  return { principalId };
}
