import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot=existsSync(resolve(process.cwd(),"apps/customer-panel/public"))?process.cwd():resolve(process.cwd(),"../../../..");
const TARGET_ARTWORK=resolve(repositoryRoot,"apps/customer-panel/public/toshi/toshi-profile.webp");

export async function GET() {
  const artwork = await readFile(TARGET_ARTWORK);
  return new Response(artwork, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/webp",
    },
  });
}
