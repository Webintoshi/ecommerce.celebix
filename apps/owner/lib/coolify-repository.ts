import "server-only";

export function normalizeCoolifyRepository(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Coolify repository bilgisi bos.");
  }

  const duplicateHttpsMatch = normalized.match(/^https?:\/\/github\.com\/https?:\/\/github\.com\/(.+)$/i);

  if (duplicateHttpsMatch?.[1]) {
    return normalizeCoolifyRepository(`https://github.com/${duplicateHttpsMatch[1]}`);
  }

  const sshGithubMatch = normalized.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (sshGithubMatch?.[1]) {
    return sshGithubMatch[1];
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(normalized)) {
    return normalized.replace(/\.git$/i, "");
  }

  const match = normalized.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (match?.[1]) {
    return match[1];
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized.replace(/\.git$/i, "");
  }

  return normalized;
}
