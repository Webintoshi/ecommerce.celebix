"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StarterThemeComposition } from "@celebix/saas-contracts";

import { storefrontDesignPreviewDependencyKey, unavailableStorefrontDesignPreviewResources, type StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";
import { storefrontDesignPreviewApi } from "./client.ts";

export function createStorefrontDesignPreviewRequestCoordinator(input: Readonly<{
  request(composition: StarterThemeComposition, signal: AbortSignal): Promise<StorefrontDesignPreviewResources>;
  apply(resources: StorefrontDesignPreviewResources): void;
  fail(composition: StarterThemeComposition): void;
}>) {
  let generation = 0, controller: AbortController | null = null, disposed = false;
  return Object.freeze({
    async refresh(composition: StarterThemeComposition): Promise<void> {
      const selected = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      try { const resources = await input.request(composition, signal); if (!disposed && selected === generation) input.apply(resources); }
      catch (error) { if (!disposed && selected === generation && !(error instanceof DOMException && error.name === "AbortError")) input.fail(composition); }
    },
    dispose(): void { disposed = true; generation += 1; controller?.abort(); },
  });
}

export function useStorefrontDesignPreviewResources(composition: StarterThemeComposition, initial: StorefrontDesignPreviewResources): StorefrontDesignPreviewResources {
  const [resources, setResources] = useState(initial);
  const dependencyKey = storefrontDesignPreviewDependencyKey(composition);
  const compositionRef = useRef(composition); compositionRef.current = composition;
  const coordinator = useMemo(() => createStorefrontDesignPreviewRequestCoordinator({ request: (selected, signal) => storefrontDesignPreviewApi.preview(selected, signal), apply: setResources, fail: (selected) => setResources(unavailableStorefrontDesignPreviewResources(selected)) }), []);
  useEffect(() => { if (resources.dependencyKey !== dependencyKey) void coordinator.refresh(compositionRef.current); }, [coordinator, dependencyKey, resources.dependencyKey]);
  useEffect(() => () => coordinator.dispose(), [coordinator]);
  return resources;
}
