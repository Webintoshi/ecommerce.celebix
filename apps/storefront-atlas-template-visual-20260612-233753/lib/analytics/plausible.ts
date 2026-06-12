type PlausibleAggregateResult = {
  visitors: number;
  pageviews: number;
};

function getEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}

export function isPlausibleConfigured(): boolean {
  return Boolean(
    getEnv("PLAUSIBLE_BASE_URL") &&
      getEnv("PLAUSIBLE_SITE_ID") &&
      getEnv("PLAUSIBLE_STATS_API_KEY")
  );
}

export async function fetchPlausibleAggregate(params: {
  startDate: string;
  endDate: string;
}): Promise<PlausibleAggregateResult | null> {
  const baseUrl = getEnv("PLAUSIBLE_BASE_URL");
  const siteId = getEnv("PLAUSIBLE_SITE_ID");
  const apiKey = getEnv("PLAUSIBLE_STATS_API_KEY");
  if (!baseUrl || !siteId || !apiKey) return null;

  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const query = new URLSearchParams({
    site_id: siteId,
    period: "custom",
    date: `${start},${end}`,
    metrics: "visitors,pageviews",
  });

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/v1/stats/aggregate?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    results?: {
      visitors?: { value?: number };
      pageviews?: { value?: number };
    };
  };

  return {
    visitors: Number(payload?.results?.visitors?.value || 0),
    pageviews: Number(payload?.results?.pageviews?.value || 0),
  };
}
