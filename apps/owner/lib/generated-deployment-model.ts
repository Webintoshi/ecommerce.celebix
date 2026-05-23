export type GeneratedDeploymentTarget = "admin" | "storefront";

export interface GeneratedDeploymentModelInput {
  target: GeneratedDeploymentTarget;
  deploymentStrategy: string;
  dockerImage: string;
  dockerImageTag: string;
  useBuildServer: boolean;
  buildServer: string;
  watchPaths: string[];
}

function getTargetLabel(target: GeneratedDeploymentTarget): string {
  return target === "admin" ? "Admin" : "Storefront";
}

export function getGeneratedDeploymentModelGuardFailure(
  input: GeneratedDeploymentModelInput,
): string | null {
  const label = getTargetLabel(input.target);

  if (input.deploymentStrategy !== "build_server_ghcr") {
    return `${label} deploy authority yalniz build_server_ghcr stratejisi ile calisabilir. legacy_git_push sessiz fallback olarak kullanilmayacak.`;
  }

  if (!input.dockerImage.trim() || !input.dockerImageTag.trim()) {
    return `${label} deploy authority image/tag zorunlulugunu karsilamiyor.`;
  }

  if (!input.useBuildServer || !input.buildServer.trim()) {
    return `${label} deploy authority build-server/GHCR zorunlulugunu karsilamiyor.`;
  }

  if (input.watchPaths.length === 0) {
    return `${label} deploy authority watch_paths olmadan yayinlanamaz.`;
  }

  return null;
}

export function isGeneratedDeploymentModelReady(
  input: GeneratedDeploymentModelInput,
): boolean {
  return getGeneratedDeploymentModelGuardFailure(input) === null;
}
