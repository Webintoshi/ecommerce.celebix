import { createDisabledOwnerInternalSelfServeCallbackGateway } from "../../../../../lib/self-serve-http/internal-callback-gateway.ts";

const handleDisabledCallback = createDisabledOwnerInternalSelfServeCallbackGateway();

export async function GET(request: Request) {
  return handleDisabledCallback(request);
}

export async function POST(request: Request) {
  return handleDisabledCallback(request);
}
