import { headers } from "next/headers";
import { serializeStructuredData } from "../lib/public-seo.ts";

export async function SeoStructuredData({ value }: Readonly<{ value: unknown }>) {
  const nonce = (await headers()).get("x-nonce");
  if (!nonce) return null;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeStructuredData(value) }} />;
}
