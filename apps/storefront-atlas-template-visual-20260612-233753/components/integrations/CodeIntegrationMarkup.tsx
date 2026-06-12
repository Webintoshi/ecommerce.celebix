import parse from "html-react-parser";

interface CodeIntegrationMarkupProps {
  html: string;
}

export default function CodeIntegrationMarkup({ html }: CodeIntegrationMarkupProps) {
  const normalizedHtml = html.trim();

  if (!normalizedHtml) {
    return null;
  }

  return <>{parse(normalizedHtml)}</>;
}
