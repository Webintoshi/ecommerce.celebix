"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StarterThemeComposition } from "@celebix/saas-contracts";

import { loadingStorefrontDesignPreviewResources, storefrontDesignPreviewDependencyKey, unavailableStorefrontDesignPreviewResources, type StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";
import { storefrontDesignPreviewApi } from "./client.ts";

type StorefrontDesignPreviewApi = Readonly<{ preview(composition: StarterThemeComposition, signal?: AbortSignal, previewProductId?: string): Promise<StorefrontDesignPreviewResources> }>;

export function createStorefrontDesignPreviewRequestCoordinator(input: Readonly<{
  request(composition: StarterThemeComposition, signal: AbortSignal, previewProductId?: string): Promise<StorefrontDesignPreviewResources>;
  apply(resources: StorefrontDesignPreviewResources): void;
  fail(composition: StarterThemeComposition, previewProductId?: string): void;
}>) {
  let generation = 0, controller: AbortController | null = null;
  function cancel(): void { generation += 1; controller?.abort(); controller = null; }
  return Object.freeze({
    async refresh(composition: StarterThemeComposition, previewProductId?: string): Promise<void> {
      const selected = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      try { const resources = await input.request(composition, signal, previewProductId); if (selected === generation) input.apply(resources); }
      catch (error) { if (selected === generation && !(error instanceof DOMException && error.name === "AbortError")) input.fail(composition, previewProductId); }
    },
    cancel,
    dispose: cancel,
  });
}

function hasLoadingResource(resources: StorefrontDesignPreviewResources): boolean {
  return resources.productDetail?.status === "loading" || resources.testimonials?.status === "loading" || resources.categoryShowcase.status === "loading" || resources.productSources.some(({ status }) => status === "loading") || resources.assets.some(({ status }) => status === "loading") || resources.hotspots.some(({ status }) => status === "loading") || resources.media?.some(({ status }) => status === "loading") === true || resources.categorySections?.some(({ status }) => status === "loading") === true;
}

export function useStorefrontDesignPreviewResources(composition: StarterThemeComposition, initial: StorefrontDesignPreviewResources, api: StorefrontDesignPreviewApi = storefrontDesignPreviewApi, previewProductId?: string): StorefrontDesignPreviewResources {
  const [resources, setResources] = useState(initial);
  // Local form edits can be incomplete. Only validated compositions may request
  // preview resources; the editor retains the input and shows its field errors.
  let dependencyKey: string | null = null;
  try { dependencyKey = storefrontDesignPreviewDependencyKey(composition, previewProductId); } catch { /* Keep the last resources until the input is complete. */ }
  const compositionRef = useRef(composition); compositionRef.current = composition;
  const resourcesRef = useRef(resources); resourcesRef.current = resources;
  const coordinator = useMemo(() => createStorefrontDesignPreviewRequestCoordinator({ request: (selected, signal, productId) => api.preview(selected, signal, productId), apply: setResources, fail: (selected, productId) => setResources(unavailableStorefrontDesignPreviewResources(selected, productId)) }), [api]);
  useEffect(() => {
    if (dependencyKey === null) { coordinator.cancel(); return () => coordinator.cancel(); }
    const selected = compositionRef.current;
    if (resourcesRef.current.dependencyKey === dependencyKey && !hasLoadingResource(resourcesRef.current)) { coordinator.cancel(); return () => coordinator.cancel(); }
    setResources(loadingStorefrontDesignPreviewResources(selected, previewProductId));
    void coordinator.refresh(selected, previewProductId);
    return () => coordinator.cancel();
  }, [coordinator, dependencyKey]);
  return resources;
}
