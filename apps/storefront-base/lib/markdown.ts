function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, '<img src="$2" alt="$1" title="$3" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCodeBlock = false;

  for (const line of lines) {
    const escapedLine = escapeHtml(line);

    if (escapedLine.startsWith("```")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }

      html.push(inCodeBlock ? "</code></pre>" : "<pre><code>");
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      html.push(`${escapedLine}\n`);
      continue;
    }

    if (!escapedLine.trim()) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (escapedLine.startsWith("### ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h3>${renderInlineMarkdown(escapedLine.slice(4))}</h3>`);
      continue;
    }

    if (escapedLine.startsWith("## ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h2>${renderInlineMarkdown(escapedLine.slice(3))}</h2>`);
      continue;
    }

    if (escapedLine.startsWith("# ")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h1>${renderInlineMarkdown(escapedLine.slice(2))}</h1>`);
      continue;
    }

    if (escapedLine.startsWith("- ") || escapedLine.startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(escapedLine.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    if (escapedLine.startsWith("> ")) {
      html.push(`<blockquote>${renderInlineMarkdown(escapedLine.slice(2))}</blockquote>`);
      continue;
    }

    html.push(`<p>${renderInlineMarkdown(escapedLine)}</p>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  if (inCodeBlock) {
    html.push("</code></pre>");
  }

  return html.join("");
}
