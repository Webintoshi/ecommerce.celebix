import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const TARGET_LOGO = resolve(
  process.cwd(),
  "apps/customer-panel/public/Logo/celebix-beyaz-logo.svg",
);

export async function GET() {
  const svg = await readFile(TARGET_LOGO);
  return new Response(svg, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
