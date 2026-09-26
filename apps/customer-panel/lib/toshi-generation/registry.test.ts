import assert from "node:assert/strict";
import test from "node:test";

test("Toshi generation registry exposes four real inference adapters", async () => {
  let module: typeof import("./registry.ts") | undefined;
  try { module = await import("./registry.ts"); } catch { /* The first RED establishes the missing inference boundary. */ }
  assert.equal(typeof module?.createToshiGenerationRegistry, "function", "The generation registry must exist before a connected provider can answer.");
  const registry = module!.createToshiGenerationRegistry!();
  for (const provider of ["openai", "gemini", "anthropic", "deepseek"] as const) assert.equal(typeof registry.get(provider).generate, "function");
});
