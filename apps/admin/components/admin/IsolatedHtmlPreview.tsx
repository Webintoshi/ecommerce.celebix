type IsolatedHtmlPreviewProps = {
  html: string;
  title: string;
  className?: string;
};

const PREVIEW_POLICY = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function IsolatedHtmlPreview({ html, title, className }: IsolatedHtmlPreviewProps) {
  const document = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}"><style>
    body { margin: 0; color: #374151; font: 15px/1.65 system-ui, sans-serif; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    pre { overflow: auto; }
    blockquote { border-inline-start: 4px solid #d1d5db; margin-inline: 0; padding-inline-start: 1rem; font-style: italic; }
  </style></head><body>${html}</body></html>`;

  return <iframe className={className} title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={document} />;
}
