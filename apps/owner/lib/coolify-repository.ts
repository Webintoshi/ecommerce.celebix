import "server-only";

export function normalizeCoolifyRepository(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Coolify repository bilgisi bos.");
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const sshGithubMatch = normalized.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (sshGithubMatch?.[1]) {
    return `https://github.com/${sshGithubMatch[1]}.git`;
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(normalized)) {
    return `https://github.com/${normalized.replace(/\.git$/i, "")}.git`;
  }

  const match = normalized.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (match?.[1]) {
    return `https://github.com/${match[1]}.git`;
  }

  return normalized;
}
