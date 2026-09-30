import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot=existsSync(resolve(process.cwd(),"apps/customer-panel/public"))?process.cwd():resolve(process.cwd(),"../../../..");
const TARGET_LOGO=resolve(repositoryRoot,"apps/customer-panel/public/Logo/celebix-beyaz-logo.svg");

export async function GET() {
  const svg = await readFile(TARGET_LOGO);
  return new Response(svg, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
