import { createSelfServeRegistrationStartHandler } from "../../../../lib/self-serve-http/registration-start.ts";
import { createDisabledSelfServeRuntime } from "../../../../lib/self-serve-http/runtime.ts";

const handleDisabledRegistration = createSelfServeRegistrationStartHandler(
  createDisabledSelfServeRuntime(),
);

export async function GET(request: Request) {
  return handleDisabledRegistration(request);
}

export async function POST(request: Request) {
  return handleDisabledRegistration(request);
}
