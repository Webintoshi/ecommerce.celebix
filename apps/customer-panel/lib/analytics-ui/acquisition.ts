export type AnalyticsAcquisitionIdentity = Readonly<{
  source: string;
  medium: string;
  campaign: string | null;
}>;

function identity(row: AnalyticsAcquisitionIdentity): string {
  return JSON.stringify([row.source, row.medium, row.campaign ?? null]);
}

/** Preserve commerce ordering and currencies, followed by unmatched traffic rows. */
export function joinAnalyticsAcquisition<
  C extends AnalyticsAcquisitionIdentity,
  B extends AnalyticsAcquisitionIdentity,
>(
  commerce: readonly C[],
  behavioral: readonly B[],
): readonly Readonly<{ commerce: C | null; behavior: B | undefined }>[] {
  const behaviorByIdentity = new Map<string, B>();
  for (const behavior of behavioral) {
    const key = identity(behavior);
    if (!behaviorByIdentity.has(key)) behaviorByIdentity.set(key, behavior);
  }
  const commerceIdentities = new Set<string>();
  const rows: { commerce: C | null; behavior: B | undefined }[] = commerce.map((row) => {
    const key = identity(row);
    commerceIdentities.add(key);
    return { commerce: row, behavior: behaviorByIdentity.get(key) };
  });
  for (const behavior of behavioral) {
    if (!commerceIdentities.has(identity(behavior))) {
      rows.push({ commerce: null, behavior });
    }
  }
  return rows;
}
