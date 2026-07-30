export type PostgresQuery = <TRow extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<TRow[]>;

export interface PostgresTransactionClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function runPostgresTransaction<TResult>(
  client: PostgresTransactionClient,
  callback: (transaction: { query: PostgresQuery }) => Promise<TResult>,
): Promise<TResult> {
  await client.query("BEGIN");

  try {
    const result = await callback({
      query: async <TRow extends Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) => {
        const response = await client.query(sql, params);
        return response.rows as TRow[];
      },
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error for the caller.
    }
    throw error;
  }
}
