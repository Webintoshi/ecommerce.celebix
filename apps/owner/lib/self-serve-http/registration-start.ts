import type { SelfServeRuntime } from "./runtime.ts";
import {
  processSelfServeRegistrationRequest,
  selfServeRegistrationJson,
  selfServeRegistrationMessage,
} from "./registration-request.ts";

export function createSelfServeRegistrationStartHandler(runtime: SelfServeRuntime) {
  return async function selfServeRegistrationStartHandler(request: Request): Promise<Response> {
    const processed = await processSelfServeRegistrationRequest(runtime, request);
    if (!processed.ok) return processed.response;

    const result = await processed.runtime.beginRegistration(processed.registration);
    if (!result.ok) {
      const code = result.code === "self_serve_registration_rejected"
        ? "self_serve_registration_rejected"
        : "self_serve_identity_start_failed";
      const status = code === "self_serve_registration_rejected" ? 400 : 503;
      processed.runtime.audit({
        operation: "registration_start",
        stage: "persistence",
        outcome: "failed",
        retryable: status === 503,
        statusCategory: status === 503 ? "5xx" : "4xx",
      });
      return selfServeRegistrationJson({
        code,
        state: "failed",
        retryable: status === 503,
        message: selfServeRegistrationMessage(code),
      }, status);
    }
    processed.runtime.audit({
      operation: "registration_start",
      stage: "persistence",
      outcome: "completed",
      retryable: false,
      statusCategory: "2xx",
    });
    return selfServeRegistrationJson({
      state: result.state,
      authorizationUrl: result.authorizationUrl,
      expiresAt: result.expiresAt,
    }, 201);
  };
}
