import assert from "node:assert/strict";
import test from "node:test";
import { validateProductImage } from "./image-validation.ts";

function png(width: number, height: number) { const value = Buffer.alloc(33); Buffer.from("89504e470d0a1a0a", "hex").copy(value); value.writeUInt32BE(13, 8); value.write("IHDR", 12, "ascii"); value.writeUInt32BE(width, 16); value.writeUInt32BE(height, 20); return value; }

test("image validation binds PNG MIME extension signature and bounded dimensions", () => {
  assert.deepEqual(validateProductImage({ bytes: png(1200, 800), mediaType: "image/png", fileName: "pilot.png" }), { mediaType: "image/png", extension: "png", width: 1200, height: 800, byteSize: 33 });
  assert.throws(() => validateProductImage({ bytes: png(1200, 800), mediaType: "image/png", fileName: "pilot.webp" }));
  assert.throws(() => validateProductImage({ bytes: png(9000, 800), mediaType: "image/png", fileName: "pilot.png" }));
  assert.throws(() => validateProductImage({ bytes: Buffer.from("<svg/>"), mediaType: "image/svg+xml", fileName: "pilot.svg" }));
});
