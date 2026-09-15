"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StarterThemeComposition } from "@celebix/saas-contracts";

import { loadingStorefrontDesignPreviewResources, storefrontDesignPreviewDependencyKey, unavailableStorefrontDesignPreviewResources, type StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";
import { storefrontDesignPreviewApi } from "./client.ts";

type StorefrontDesignPreviewApi = Readonly<{ preview(composition: StarterThemeComposition, signal?: AbortSignal): Promise<StorefrontDesignPreviewResources> }>;

export function createStorefrontDesignPreviewRequestCoordinator(input: Readonly<{
  request(composition: StarterThemeComposition, signal: AbortSignal): Promise<StorefrontDesignPreviewResources>;
  apply(resources: StorefrontDesignPreviewResources): void;
  fail(composition: StarterThemeComposition): void;
}>) {
  let generation = 0, controller: AbortController | null = null;
  function cancel(): void { generation += 1; controller?.abort(); controller = null; }
  return Object.freeze({
    async refresh(composition: StarterThemeComposition): Promise<void> {
      const selected = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      try { const resources = await input.request(composition, signal); if (selected === generation) input.apply(resources); }
      catch (error) { if (selected === generation && !(error instanceof DOMException && error.name === "AbortError")) input.fail(composition); }
    },
    cancel,
    dispose: cancel,
  });
}

function hasLoadingResource(resources: StorefrontDesignPreviewResources): boolean {
  return resources.categoryShowcase.status === "loading" || resources.productSources.some(({ status }) => status === "loading") || resources.assets.some(({ status }) => status === "loading") || resources.hotspots.some(({ status }) => status === "loading");
}

export function useStorefrontDesignPreviewResources(composition: StarterThemeComposition, initial: StorefrontDesignPreviewResources, api: StorefrontDesignPreviewApi = storefrontDesignPreviewApi): StorefrontDesignPreviewResources {
  const [resources, setResources] = useState(initial);
  const dependencyKey = storefrontDesignPreviewDependencyKey(composition);
  const compositionRef = useRef(composition); compositionRef.current = composition;
  const resourcesRef = useRef(resources); resourcesRef.current = resources;
  const coordinator = useMemo(() => createStorefrontDesignPreviewRequestCoordinator({ request: (selected, signal) => api.preview(selected, signal), apply: setResources, fail: (selected) => setResources(unavailableStorefrontDesignPreviewResources(selected)) }), [api]);
  useEffect(() => {
    const selected = compositionRef.current;
    if (resourcesRef.current.dependencyKey === dependencyKey && !hasLoadingResource(resourcesRef.current)) { coordinator.cancel(); return () => coordinator.cancel(); }
    setResources(loadingStorefrontDesignPreviewResources(selected));
    void coordinator.refresh(selected);
    return () => coordinator.cancel();
  }, [coordinator, dependencyKey]);
  return resources;
}
