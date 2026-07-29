import assert from "node:assert/strict";
import test from "node:test";
import { MigrationImageError, fetchMigrationImage, type MigrationImageRawResponse } from "./remote-image-fetcher.ts";

function png(width = 2, height = 3): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function response(status: number, headers: HeadersInit, chunks: readonly Uint8Array[] = [png()]): MigrationImageRawResponse {
  return { status, headers: new Headers(headers), body: { async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; } } };
}

function jsonResponse(value: unknown): MigrationImageRawResponse {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return response(200, { "content-type": "application/json; charset=utf-8", "content-length": String(bytes.byteLength) }, [bytes]);
}

test("fetches one DNS-pinned image without ambient browser or authentication headers", async () => {
  let requestInput: any;
  const result = await fetchMigrationImage("https://media.example.test/uploads/yuzuk.png", {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (input) => { requestInput = input; return response(200, { "content-type": "image/png", "content-length": "24" }); },
  });
  assert.deepEqual({ mediaType: result.mediaType, width: result.width, height: result.height, byteSize: result.bytes.byteLength }, { mediaType: "image/png", width: 2, height: 3, byteSize: 24 });
  assert.deepEqual(requestInput.headers, { accept: "image/webp,image/png,image/jpeg", "user-agent": "Celebix-Catalog-Migration/1.0" });
  assert.equal(requestInput.address, "8.8.8.8");
  assert.equal(requestInput.url, "https://media.example.test/uploads/yuzuk.png");
});

test("recovers a corrupt WordPress original from the largest exact same-origin derivative", async () => {
  const original = "https://media.example.test/wp-content/uploads/2026/07/broken.png";
  const smaller = "https://media.example.test/wp-content/uploads/2026/07/broken-200x300.png";
  const larger = "https://media.example.test/wp-content/uploads/2026/07/broken-683x1024.png";
  const requests: string[] = [];
  const result = await fetchMigrationImage(original, {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (input) => {
      requests.push(input.url);
      if (input.url === original) return response(200, { "content-type": "image/png" }, [new Uint8Array(24)]);
      if (input.url.includes("/wp-json/wp/v2/media?")) return jsonResponse([{
        source_url: original,
        media_details: { sizes: {
          medium: { width: 200, height: 300, mime_type: "image/png", source_url: smaller },
          large: { width: 683, height: 1024, mime_type: "image/png", source_url: larger },
        } },
      }]);
      if (input.url === larger) return response(200, { "content-type": "image/png", "content-length": "24" }, [png(683, 1024)]);
      throw new Error("unexpected_request");
    },
  });
  assert.deepEqual({ mediaType: result.mediaType, width: result.width, height: result.height }, { mediaType: "image/png", width: 683, height: 1024 });
  assert.equal(requests[0], original);
  assert.match(requests[1]!, /^https:\/\/media\.example\.test\/wp-json\/wp\/v2\/media\?/);
  assert.equal(requests[2], larger);
  assert.equal(requests.includes(smaller), false);
});

test("never follows WordPress recovery metadata outside the exact source authority", async () => {
  const original = "https://media.example.test/wp-content/uploads/2026/07/broken.png";
  const requests: string[] = [];
  await assert.rejects(() => fetchMigrationImage(original, {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (input) => {
      requests.push(input.url);
      if (input.url === original) return response(200, { "content-type": "image/png" }, [new Uint8Array(24)]);
      return jsonResponse([{
        source_url: original,
        media_details: { sizes: { medium: {
          width: 200, height: 300, mime_type: "image/png",
          source_url: "https://evil.example.test/wp-content/uploads/2026/07/broken-200x300.png",
        } } },
      }]);
    },
  }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_response_invalid");
  assert.equal(requests.length, 2);
});

test("does not attempt WordPress recovery for an unrelated corrupt image path", async () => {
  const requests: string[] = [];
  await assert.rejects(() => fetchMigrationImage("https://media.example.test/assets/broken.png", {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (input) => { requests.push(input.url); return response(200, { "content-type": "image/png" }, [new Uint8Array(24)]); },
  }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_response_invalid");
  assert.equal(requests.length, 1);
});

test("rejects an invalid image signature before consuming the remaining response body", async () => {
  let consumedChunks = 0;
  await assert.rejects(() => fetchMigrationImage("https://media.example.test/assets/broken.png", {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async () => ({
      status: 200,
      headers: new Headers({ "content-type": "image/png", "content-length": "1048600" }),
      body: {
        async *[Symbol.asyncIterator]() {
          consumedChunks += 1;
          yield new Uint8Array(24);
          consumedChunks += 1;
          yield new Uint8Array(1_048_576);
        },
      },
    }),
  }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_response_invalid");
  assert.equal(consumedChunks, 1);
});

test("revalidates DNS on every redirect and denies rebinding before another request", async () => {
  let lookups = 0, requests = 0;
  await assert.rejects(() => fetchMigrationImage("https://media.example.test/a.png", {
    lookup: async () => (++lookups === 1 ? [{ address: "8.8.8.8", family: 4 as const }] : [{ address: "127.0.0.1", family: 4 as const }]),
    request: async () => { requests += 1; return response(302, { location: "/b.png" }, []); },
  }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_address_denied");
  assert.equal(lookups, 2); assert.equal(requests, 1);
});

test("rejects MIME signature dimensions encoding status and streamed-size confusion", async () => {
  const cases: Array<readonly [string, MigrationImageRawResponse, MigrationImageError["code"]]> = [
    ["HTML MIME", response(200, { "content-type": "text/html" }), "migration_image_response_invalid"],
    ["wrong signature", response(200, { "content-type": "image/jpeg" }), "migration_image_response_invalid"],
    ["oversized dimensions", response(200, { "content-type": "image/png" }, [png(9000, 1)]), "migration_image_response_invalid"],
    ["encoded", response(200, { "content-type": "image/png", "content-encoding": "gzip" }), "migration_image_response_invalid"],
    ["status", response(404, { "content-type": "image/png" }), "migration_image_response_invalid"],
    ["length", response(200, { "content-type": "image/png", "content-length": "5242881" }), "migration_image_response_too_large"],
    ["stream", response(200, { "content-type": "image/png" }, [new Uint8Array(5_242_881)]), "migration_image_response_too_large"],
  ];
  for (const [name, selected, code] of cases) {
    await assert.rejects(() => fetchMigrationImage("https://media.example.test/a.png", {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: async () => selected,
    }), (error: unknown) => error instanceof MigrationImageError && error.code === code, name);
  }
});

test("rejects unsafe redirect targets and redirect loops", async () => {
  for (const location of ["http://media.example.test/a.png", "https://127.0.0.1/a.png", "https://user:secret@media.example.test/a.png", "//media.example.test:8443/a.png"]) {
    await assert.rejects(() => fetchMigrationImage("https://media.example.test/a.png", {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: async () => response(302, { location }, []),
    }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_redirect_invalid");
  }
  await assert.rejects(() => fetchMigrationImage("https://media.example.test/a.png", {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: async () => response(302, { location: "/again.png" }, []),
  }), (error: unknown) => error instanceof MigrationImageError && error.code === "migration_image_redirect_invalid");
});
