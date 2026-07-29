import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";

const PAYTR_ENDPOINT = "https://www.paytr.com/odeme/api/get-token";
const IYZICO_ENDPOINT = "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom";
const IYZICO_PRESENTATION = "https://sandbox-cpp.iyzipay.com";
const IYZICO_API_KEY = "sandbox-api-key";
const IYZICO_SECRET_KEY = "sandbox-secret-key";
const PROVIDER_TOKEN = "fixture_token_000000000000000000000000000000000001";
const CONTROL_PORT = Number(process.env.CELEBIX_CHECKOUT_PROVIDER_CONTROL_PORT);
const CONTROL_TOKEN = process.env.CELEBIX_CHECKOUT_PROVIDER_CONTROL_TOKEN ?? "";
const MODES = new Set(["redirect", "processing", "rejected"]);
const PROVIDERS = new Set(["iyzico", "paytr"]);
const MAXIMUM_CONTROL_BYTES = 256;
const MAXIMUM_PROVIDER_BYTES = 262_144;
const originalFetch = globalThis.fetch.bind(globalThis);
const state = {
  outcomes: { iyzico: "rejected", paytr: "rejected" },
  calls: [],
};

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  try {
    return leftBytes.byteLength === rightBytes.byteLength
      && timingSafeEqual(leftBytes, rightBytes);
  } finally {
    leftBytes.fill(0);
    rightBytes.fill(0);
  }
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function providerPacket(request, provider) {
  if (
    request.method !== "POST"
    || request.redirect !== "manual"
    || request.credentials !== "omit"
    || request.cache !== "no-store"
  ) throw new Error("checkout_provider_packet_invalid");
  const expectedType = provider === "iyzico"
    ? "application/json"
    : "application/x-www-form-urlencoded";
  if (request.headers.get("content-type") !== expectedType) {
    throw new Error("checkout_provider_content_type_invalid");
  }
  const body = Buffer.from(await request.clone().arrayBuffer());
  try {
    if (body.byteLength < 1 || body.byteLength > MAXIMUM_PROVIDER_BYTES) {
      throw new Error("checkout_provider_body_invalid");
    }
    if (provider === "paytr") {
      const params = new URLSearchParams(body.toString("utf8"));
      const fieldNames = [...new Set(params.keys())].sort();
      if (
        fieldNames.length !== [...params.keys()].length
        || !fieldNames.includes("merchant_id")
        || !fieldNames.includes("paytr_token")
        || !fieldNames.includes("merchant_oid")
      ) throw new Error("checkout_paytr_packet_invalid");
      return { bodyBytes: body.byteLength, fieldNames, conversationId: null };
    }
    const authorization = request.headers.get("authorization");
    if (authorization === null || !authorization.startsWith("IYZWSv2 ")) {
      throw new Error("checkout_iyzico_authorization_missing");
    }
    const decoded = Buffer.from(authorization.slice("IYZWSv2 ".length), "base64");
    try {
      if (!decoded.toString("utf8").startsWith(`apiKey:${IYZICO_API_KEY}&randomKey:`)) {
        throw new Error("checkout_iyzico_authorization_invalid");
      }
    } finally {
      decoded.fill(0);
    }
    const parsed = JSON.parse(body.toString("utf8"));
    const fieldNames = Object.keys(parsed).sort();
    if (
      typeof parsed !== "object"
      || parsed === null
      || Array.isArray(parsed)
      || typeof parsed.conversationId !== "string"
      || !/^[0-9a-f-]{36}$/.test(parsed.conversationId)
      || !fieldNames.includes("buyer")
      || !fieldNames.includes("basketItems")
      || !fieldNames.includes("callbackUrl")
    ) throw new Error("checkout_iyzico_packet_invalid");
    return {
      bodyBytes: body.byteLength,
      fieldNames,
      conversationId: parsed.conversationId,
    };
  } finally {
    body.fill(0);
  }
}

function providerResponse(provider, outcome, packet) {
  state.calls.push(Object.freeze({
    bodyBytes: packet.bodyBytes,
    endpoint: provider === "iyzico"
      ? "/payment/iyzipos/checkoutform/initialize/auth/ecom"
      : "/odeme/api/get-token",
    fieldNames: packet.fieldNames,
    outcome,
    provider,
  }));
  if (outcome === "processing") {
    return json(503, { status: "failure" });
  }
  if (outcome === "rejected") {
    return provider === "iyzico"
      ? json(400, { status: "failure", errorCode: "2000", errorMessage: "rejected" })
      : json(200, { status: "failed", reason: "rejected" });
  }
  if (provider === "paytr") {
    return json(200, { status: "success", token: PROVIDER_TOKEN });
  }
  const signature = createHmac("sha256", IYZICO_SECRET_KEY)
    .update(`${packet.conversationId}:${PROVIDER_TOKEN}`, "utf8")
    .digest("hex");
  return json(200, {
    status: "success",
    conversationId: packet.conversationId,
    token: PROVIDER_TOKEN,
    paymentPageUrl: `${IYZICO_PRESENTATION}/?token=${PROVIDER_TOKEN}&lang=tr`,
    signature,
  });
}

globalThis.fetch = async function checkoutProviderFetch(input, init) {
  const request = input instanceof Request && init === undefined
    ? input
    : new Request(input, init);
  const provider = request.url === IYZICO_ENDPOINT
    ? "iyzico"
    : request.url === PAYTR_ENDPOINT
      ? "paytr"
      : null;
  if (provider === null) return originalFetch(input, init);
  const packet = await providerPacket(request, provider);
  return providerResponse(provider, state.outcomes[provider], packet);
};

function controlAuthorized(request) {
  const supplied = request.headers["x-checkout-control"];
  return typeof supplied === "string"
    && CONTROL_TOKEN.length >= 32
    && safeEqual(supplied, CONTROL_TOKEN);
}

function readControlBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.byteLength;
      if (total > MAXIMUM_CONTROL_BYTES) {
        reject(new Error("checkout_provider_control_too_large"));
        request.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      const bytes = Buffer.concat(chunks);
      try {
        resolve(JSON.parse(bytes.toString("utf8")));
      } catch (error) {
        reject(error);
      } finally {
        bytes.fill(0);
        for (const chunk of chunks) chunk.fill(0);
      }
    });
    request.on("error", reject);
  });
}

if (!Number.isSafeInteger(CONTROL_PORT) || CONTROL_PORT < 1024 || CONTROL_PORT > 65535) {
  throw new Error("checkout_provider_control_port_invalid");
}

const control = http.createServer(async (request, response) => {
  try {
    if (!controlAuthorized(request)) {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "GET" && request.url === "/state") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ calls: state.calls }));
      return;
    }
    if (request.method === "PUT" && request.url === "/outcome") {
      const selected = await readControlBody(request);
      if (
        typeof selected !== "object"
        || selected === null
        || Array.isArray(selected)
        || Object.keys(selected).sort().join(",") !== "outcome,provider"
        || !PROVIDERS.has(selected.provider)
        || !MODES.has(selected.outcome)
      ) throw new Error("checkout_provider_control_invalid");
      state.outcomes[selected.provider] = selected.outcome;
      response.writeHead(204).end();
      return;
    }
    if (request.method === "DELETE" && request.url === "/calls") {
      state.calls.length = 0;
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  } catch {
    if (!response.headersSent) response.writeHead(400);
    response.end();
  }
});
control.listen(CONTROL_PORT, "127.0.0.1");
