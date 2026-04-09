function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();

  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("/")
  ) {
    return escapeHtml(trimmed);
  }

  return "";
}

function applyInlineMarkdown(value: string): string {
  const inlineCodes: string[] = [];
  let output = value.replace(/`([^`]+)`/g, (_, code: string) => {
    const index = inlineCodes.push(`<code>${escapeHtml(code)}</code>`) - 1;
    return `@@INLINE_CODE_${index}@@`;
  });

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return escapeHtml(`![${alt}](${url})`);
    return `<img src="${safeUrl}" alt="${escapeHtml(alt)}" />`;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return escapeHtml(`[${label}](${url})`);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });

  output = escapeHtml(output)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

  return output.replace(/@@INLINE_CODE_(\d+)@@/g, (_, index: string) => inlineCodes[Number(index)] || "");
}

function renderParagraph(block: string): string {
  return `<p>${applyInlineMarkdown(block).replace(/\n/g, "<br />")}</p>`;
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const codeBlocks: Array<{ language: string; code: string }> = [];
  const prepared = normalized.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language: string, code: string) => {
    const index = codeBlocks.push({ language: language || "", code }) - 1;
    return `@@CODE_BLOCK_${index}@@`;
  });

  return prepared
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const codeMatch = block.match(/^@@CODE_BLOCK_(\d+)@@$/);
      if (codeMatch) {
        const entry = codeBlocks[Number(codeMatch[1])];
        const languageAttr = entry.language ? ` data-language="${escapeHtml(entry.language)}"` : "";
        return `<pre><code${languageAttr}>${escapeHtml(entry.code)}</code></pre>`;
      }

      const lines = block.split("\n").map((line) => line.trimEnd());
      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        return `<ul>${lines
          .map((line) => line.replace(/^[-*]\s+/, "").trim())
          .map((item) => `<li>${applyInlineMarkdown(item)}</li>`)
          .join("")}</ul>`;
      }
      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `<ol>${lines
          .map((line) => line.replace(/^\d+\.\s+/, "").trim())
          .map((item) => `<li>${applyInlineMarkdown(item)}</li>`)
          .join("")}</ol>`;
      }
      if (lines.every((line) => /^>\s?/.test(line))) {
        return `<blockquote>${renderParagraph(lines.map((line) => line.replace(/^>\s?/, "")).join("\n"))}</blockquote>`;
      }
      if (lines.length === 1) {
        const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          return `<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`;
        }
        if (/^---+$/.test(lines[0])) return "<hr />";
      }
      return renderParagraph(lines.join("\n"));
    })
    .join("\n");
}
