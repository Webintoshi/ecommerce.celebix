import { readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const DATABASE_URL = /^postgres(?:ql)?:\/\//i;

async function defaultLoadSource(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

function runtimeModuleSpecifier(node) {
  if (ts.isImportDeclaration(node)) {
    if (!ts.isStringLiteralLike(node.moduleSpecifier)) return null;
    const clause = node.importClause;
    if (clause?.isTypeOnly) return null;
    if (
      clause
      && !clause.name
      && clause.namedBindings
      && ts.isNamedImports(clause.namedBindings)
      && clause.namedBindings.elements.every((element) => element.isTypeOnly)
    ) return null;
    return node.moduleSpecifier.text;
  }
  if (ts.isExportDeclaration(node)) {
    if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier)) return null;
    if (node.isTypeOnly) return null;
    if (
      node.exportClause
      && ts.isNamedExports(node.exportClause)
      && node.exportClause.elements.every((element) => element.isTypeOnly)
    ) return null;
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node)
    && !node.isTypeOnly
    && ts.isExternalModuleReference(node.moduleReference)
    && node.moduleReference.expression
    && ts.isStringLiteralLike(node.moduleReference.expression)
  ) return node.moduleReference.expression.text;
  if (
    ts.isCallExpression(node)
    && node.arguments.length === 1
    && ts.isStringLiteralLike(node.arguments[0])
    && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require")
    )
  ) return node.arguments[0].text;
  return null;
}

function jsxTagName(node) {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : node.tagName.getText();
}

function scriptHasNonce(opening) {
  return opening.attributes.properties.some((attribute) => (
    ts.isJsxAttribute(attribute)
    && ts.isIdentifier(attribute.name)
    && attribute.name.text === "nonce"
  ));
}

function analyzeSource(file, source) {
  if (path.extname(file) === ".css") {
    return Object.freeze({
      file,
      source,
      imports: Object.freeze([]),
      identifiers: new Set(),
      stringLiterals: Object.freeze([]),
      unsafeInlineScripts: 0,
      parseDiagnostics: Object.freeze([]),
      clientDirective: false,
    });
  }
  const scriptKind = /[.]tsx?$/.test(file)
    ? (file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    : (file.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const selected = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ESNext,
    true,
    scriptKind,
  );
  const imports = [];
  const identifiers = new Set();
  const stringLiterals = [];
  let unsafeInlineScripts = 0;
  const visit = (node) => {
    const specifier = runtimeModuleSpecifier(node);
    if (specifier !== null) imports.push(specifier);
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isStringLiteralLike(node)) stringLiterals.push(node.text);
    if (
      ts.isJsxElement(node)
      && jsxTagName(node.openingElement) === "script"
      && !scriptHasNonce(node.openingElement)
    ) unsafeInlineScripts += 1;
    if (
      ts.isJsxSelfClosingElement(node)
      && jsxTagName(node) === "script"
      && !scriptHasNonce(node)
    ) unsafeInlineScripts += 1;
    ts.forEachChild(node, visit);
  };
  visit(selected);
  return Object.freeze({
    file,
    source,
    imports: Object.freeze([...new Set(imports)]),
    identifiers,
    stringLiterals: Object.freeze(stringLiterals),
    unsafeInlineScripts,
    parseDiagnostics: Object.freeze(selected.parseDiagnostics.map((diagnostic) => diagnostic.code)),
    clientDirective: selected.statements.some((statement) => (
      ts.isExpressionStatement(statement)
      && ts.isStringLiteral(statement.expression)
      && statement.expression.text === "use client"
    )),
  });
}

function importBase(rootDirectory, importer, specifier) {
  if (specifier.startsWith("@/")) {
    return path.resolve(rootDirectory, specifier.slice(2));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(importer), specifier);
  }
  return null;
}

function sourceCandidates(base) {
  if (SOURCE_EXTENSIONS.includes(path.extname(base))) return [base];
  return [
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
}

export async function traceCheckoutSourceGraph(input) {
  const loadSource = input.loadSource ?? defaultLoadSource;
  const rootDirectory = path.resolve(input.rootDirectory);
  const sources = new Map();
  const clientFiles = new Set();
  const missingSources = [];
  const unresolvedLocalImports = [];
  const modes = new Map();
  const queued = [
    ...input.entrypoints.map((file) => ({ file: path.resolve(file), client: false })),
    ...input.clientEntrypoints.map((file) => ({ file: path.resolve(file), client: true })),
  ];
  const sourceCache = new Map();
  const load = async (file) => {
    if (!sourceCache.has(file)) sourceCache.set(file, await loadSource(file));
    return sourceCache.get(file);
  };
  const resolveLocal = async (importer, specifier) => {
    const base = importBase(rootDirectory, importer, specifier);
    if (base === null) return null;
    for (const candidate of sourceCandidates(base)) {
      if (await load(candidate) !== null) return candidate;
    }
    unresolvedLocalImports.push(Object.freeze({ importer, specifier, base }));
    return null;
  };

  while (queued.length > 0) {
    const current = queued.shift();
    const mode = current.client ? 2 : 1;
    const prior = modes.get(current.file) ?? 0;
    if ((prior & mode) !== 0) continue;
    modes.set(current.file, prior | mode);
    const source = await load(current.file);
    if (source === null) {
      missingSources.push(current.file);
      continue;
    }
    const metadata = sources.get(current.file) ?? analyzeSource(current.file, source);
    sources.set(current.file, metadata);
    const effectiveClient = current.client || metadata.clientDirective;
    if (effectiveClient) {
      clientFiles.add(current.file);
      modes.set(current.file, (modes.get(current.file) ?? 0) | 2);
    }
    for (const specifier of metadata.imports) {
      const dependency = await resolveLocal(current.file, specifier);
      if (dependency !== null) queued.push({ file: dependency, client: effectiveClient });
    }
  }

  return Object.freeze({
    rootDirectory,
    sources,
    clientFiles,
    missingSources: Object.freeze([...new Set(missingSources)]),
    unresolvedLocalImports: Object.freeze(unresolvedLocalImports),
  });
}

function finding(code, file, detail) {
  return Object.freeze({ code, file, detail });
}

function themeSpecifier(value) {
  return /(?:^|[/_-])themes?(?:[/_-]|$)/i.test(value)
    || /(?:^|[/_-])(?:Header|Footer)(?:[./_-]|$)/.test(value);
}

export function auditCheckoutSourceGraph(graph) {
  const findings = [];
  for (const file of graph.missingSources) {
    findings.push(finding("missing_source", file, "entrypoint"));
  }
  for (const value of graph.unresolvedLocalImports) {
    findings.push(finding("missing_local_source", value.importer, value.specifier));
  }
  for (const [file, metadata] of graph.sources) {
    for (const specifier of metadata.imports) {
      if (/supabase/i.test(specifier)) {
        findings.push(finding("forbidden_supabase_dependency", file, specifier));
      }
      if (/apps[/]storefront-base/i.test(specifier)) {
        findings.push(finding("legacy_storefront_dependency", file, specifier));
      }
      if (themeSpecifier(specifier)) {
        findings.push(finding("forbidden_theme_dependency", file, specifier));
      }
      if (
        graph.clientFiles.has(file)
        && (specifier === "pg" || specifier === "node:process" || specifier === "server-only" || specifier === "@celebix/saas-data")
      ) findings.push(finding("forbidden_browser_database", file, specifier));
    }
    if (
      metadata.identifiers.has("Header")
      || metadata.identifiers.has("Footer")
      || metadata.identifiers.has("themeKey")
    ) findings.push(finding("forbidden_theme_dependency", file, "identifier"));
    if (
      metadata.stringLiterals.some((value) => DATABASE_URL.test(value))
      || (graph.clientFiles.has(file) && metadata.identifiers.has("CELEBIX_SAAS_DATABASE_URL"))
      || (graph.clientFiles.has(file) && metadata.stringLiterals.includes("CELEBIX_SAAS_DATABASE_URL"))
    ) findings.push(finding("forbidden_browser_database", file, "database authority"));
    if (
      metadata.identifiers.has("dangerouslySetInnerHTML")
      || metadata.unsafeInlineScripts > 0
    ) findings.push(finding("unsafe_inline_script", file, "nonce missing or executable HTML"));
    if (metadata.parseDiagnostics.length > 0) {
      findings.push(finding("unsafe_source_parse", file, metadata.parseDiagnostics.join(",")));
    }
  }
  return Object.freeze(findings.sort((left, right) => (
    left.file.localeCompare(right.file)
    || left.code.localeCompare(right.code)
    || left.detail.localeCompare(right.detail)
  )));
}
