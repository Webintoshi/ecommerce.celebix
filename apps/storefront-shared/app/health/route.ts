import { createHealthPayload } from "@/lib/storefront-app.ts";
import { STOREFRONT_SECURITY_HEADERS } from "@/lib/response.ts";

export function GET(): Response {
  return Response.json(createHealthPayload(), {
    status: 200,
    headers: STOREFRONT_SECURITY_HEADERS,
  });
}
