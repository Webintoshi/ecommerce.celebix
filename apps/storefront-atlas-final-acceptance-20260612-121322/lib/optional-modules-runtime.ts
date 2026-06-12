import generatedRuntime from "@/celebix.generated-runtime.json";

type OptionalModuleKey = keyof typeof generatedRuntime.optionalModules;

export function isOptionalModuleDisabled(key: OptionalModuleKey) {
  return generatedRuntime.optionalModules[key] === "disabled";
}

export function optionalModuleDisabledPayload(module: OptionalModuleKey) {
  return {
    success: false,
    error: "optional_module_disabled",
    module,
  };
}
