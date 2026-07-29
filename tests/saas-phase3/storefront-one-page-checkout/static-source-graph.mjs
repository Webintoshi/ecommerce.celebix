import { readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const DATABASE_URL = /^postgres(?:ql)?:\/\//i;
const JSX_SCRIPT_FACTORIES = new Set(["jsx", "jsxs", "jsxDEV", "_jsx", "_jsxs", "_jsxDEV"]);

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

function dynamicDependencyKind(node) {
  if (!ts.isCallExpression(node)) return null;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return "import";
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") return "require";
  return null;
}

function jsxTagName(node) {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : node.tagName.getText();
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression)
    && expression.argumentExpression
    && ts.isStringLiteralLike(expression.argumentExpression)
  ) return expression.argumentExpression.text;
  return null;
}

function scriptFactoryAliases(sourceFile) {
  const aliases = new Set(["createElement", ...JSX_SCRIPT_FACTORIES]);
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteralLike(statement.moduleSpecifier)
      || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue;
    const source = statement.moduleSpecifier.text;
    for (const element of statement.importClause.namedBindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (
        (source === "react" && imported === "createElement")
        || (/^react\/jsx(?:-dev)?-runtime$/.test(source) && JSX_SCRIPT_FACTORIES.has(imported))
      ) aliases.add(element.name.text);
    }
  }
  return aliases;
}

function unsafeScriptFactoryCall(node, aliases) {
  if (!ts.isCallExpression(node)) return false;
  const name = callName(node.expression);
  if (name === null || !aliases.has(name)) return false;
  const tag = node.arguments[0];
  if (!tag || !ts.isStringLiteralLike(tag)) return true;
  return tag.text.toLowerCase() === "script";
}

function cssQuotedValue(value, start) {
  const quote = value[start];
  let selected = "";
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") return null;
    if (character === quote) return { value: selected, end: index + 1 };
    selected += character;
  }
  return null;
}

function cssStringEnd(value, start) {
  const quote = value[start];
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") index += 1;
    else if (value[index] === quote) return index + 1;
  }
  return null;
}

function cssStructureDiagnostics(source) {
  const diagnostics = [];
  const stack = [];
  const closingFor = Object.freeze({ "(": ")", "[": "]", "{": "}" });
  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith("/*", index)) {
      const closing = source.indexOf("*/", index + 2);
      if (closing === -1) {
        diagnostics.push("unterminated CSS comment");
        break;
      }
      index = closing + 1;
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      const closing = cssStringEnd(source, index);
      if (closing === null) {
        diagnostics.push("unterminated CSS string");
        break;
      }
      index = closing - 1;
      continue;
    }
    if (source[index] === "(" || source[index] === "[" || source[index] === "{") {
      stack.push(source[index]);
      continue;
    }
    if (source[index] === ")" || source[index] === "]" || source[index] === "}") {
      const opening = stack.pop();
      if (!opening || closingFor[opening] !== source[index]) {
        diagnostics.push(`unexpected CSS delimiter ${source[index]}`);
        break;
      }
    }
  }
  if (stack.length > 0) diagnostics.push(`unclosed CSS delimiter ${stack.at(-1)}`);
  return Object.freeze([...new Set(diagnostics)]);
}

function cssImportSpecifier(clause) {
  const selected = clause.trimStart();
  if (selected[0] === '"' || selected[0] === "'") {
    return cssQuotedValue(selected, 0)?.value ?? null;
  }
  const url = /^url\s*\(/i.exec(selected);
  if (!url) return null;
  let index = url[0].length;
  while (/\s/.test(selected[index] ?? "")) index += 1;
  if (selected[index] === '"' || selected[index] === "'") {
    const quoted = cssQuotedValue(selected, index);
    if (!quoted) return null;
    index = quoted.end;
    while (/\s/.test(selected[index] ?? "")) index += 1;
    return selected[index] === ")" ? quoted.value : null;
  }
  const closing = selected.indexOf(")", index);
  if (closing === -1) return null;
  const value = selected.slice(index, closing).trim();
  if (!value || /[\\()'"\s]/.test(value)) return null;
  return value;
}

function analyzeCssSource(file, source) {
  const imports = [];
  const unresolvedDynamicDependencies = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      const closing = source.indexOf("*/", index + 2);
      if (closing === -1) {
        unresolvedDynamicDependencies.push("unterminated CSS comment");
        break;
      }
      index = closing + 2;
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      const closing = cssStringEnd(source, index);
      if (closing === null) {
        unresolvedDynamicDependencies.push("unterminated CSS string");
        break;
      }
      index = closing;
      continue;
    }
    if (source[index] !== "@" || source.slice(index, index + 7).toLowerCase() !== "@import") {
      index += 1;
      continue;
    }
    const boundary = source[index + 7];
    if (boundary && /[a-z0-9_-]/i.test(boundary)) {
      index += 1;
      continue;
    }
    const start = index + 7;
    let cursor = start;
    let quote = null;
    let parentheses = 0;
    let complete = false;
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (quote !== null) {
        if (character === "\\") {
          unresolvedDynamicDependencies.push("escaped CSS import");
          cursor += 1;
        } else if (character === quote) quote = null;
        continue;
      }
      if (source.startsWith("/*", cursor)) {
        const closing = source.indexOf("*/", cursor + 2);
        if (closing === -1) break;
        cursor = closing + 1;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === "(") parentheses += 1;
      else if (character === ")") parentheses -= 1;
      else if (character === ";" && parentheses === 0) {
        complete = true;
        break;
      }
      if (parentheses < 0) break;
    }
    if (!complete || quote !== null || parentheses !== 0) {
      unresolvedDynamicDependencies.push("unparseable CSS @import");
      index = Math.max(cursor + 1, start);
      continue;
    }
    const specifier = cssImportSpecifier(source.slice(start, cursor));
    if (specifier === null) unresolvedDynamicDependencies.push("non-literal CSS @import");
    else imports.push(specifier);
    index = cursor + 1;
  }
  return Object.freeze({
    file,
    source,
    imports: Object.freeze([...new Set(imports)]),
    identifiers: new Set(),
    themeShellIdentifiers: new Set(),
    stringLiterals: Object.freeze([]),
    unsafeInlineScripts: 0,
    unresolvedDynamicDependencies: Object.freeze(unresolvedDynamicDependencies),
    parseDiagnostics: cssStructureDiagnostics(source),
    clientDirective: false,
  });
}

function themeShellName(value) {
  return /(?:header|footer)$/i.test(value);
}

function importBindingNames(node) {
  if (!ts.isImportDeclaration(node) || !node.importClause || node.importClause.isTypeOnly) return [];
  const names = [];
  if (node.importClause.name) names.push(node.importClause.name.text);
  const bindings = node.importClause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) {
        names.push(element.name.text);
        if (element.propertyName) names.push(element.propertyName.text);
      }
    }
  }
  return names;
}

function declaredComponentName(node) {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    && node.name
  ) return node.name.text;
  if (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && /^[A-Z][A-Za-z0-9]*$/.test(node.name.text)
  ) return node.name.text;
  if (
    (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
  ) {
    const name = jsxTagName(ts.isJsxElement(node) ? node.openingElement : node);
    return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : null;
  }
  return null;
}

function analyzeSource(file, source) {
  if (path.extname(file) === ".css") return analyzeCssSource(file, source);
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
  const scriptFactories = scriptFactoryAliases(selected);
  const imports = [];
  const identifiers = new Set();
  const themeShellIdentifiers = new Set();
  const stringLiterals = [];
  const unresolvedDynamicDependencies = [];
  let unsafeInlineScripts = 0;
  const visit = (node) => {
    const specifier = runtimeModuleSpecifier(node);
    if (specifier !== null) imports.push(specifier);
    const dynamicKind = dynamicDependencyKind(node);
    if (
      dynamicKind !== null
      && (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]))
    ) unresolvedDynamicDependencies.push(`${dynamicKind}(non-literal)`);
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    for (const name of importBindingNames(node)) {
      if (themeShellName(name)) themeShellIdentifiers.add(name);
    }
    const componentName = declaredComponentName(node);
    if (componentName !== null && themeShellName(componentName)) {
      themeShellIdentifiers.add(componentName);
    }
    if (ts.isStringLiteralLike(node)) stringLiterals.push(node.text);
    if (
      ts.isJsxElement(node)
      && jsxTagName(node.openingElement) === "script"
    ) unsafeInlineScripts += 1;
    if (
      ts.isJsxSelfClosingElement(node)
      && jsxTagName(node) === "script"
    ) unsafeInlineScripts += 1;
    if (unsafeScriptFactoryCall(node, scriptFactories)) unsafeInlineScripts += 1;
    ts.forEachChild(node, visit);
  };
  visit(selected);
  return Object.freeze({
    file,
    source,
    imports: Object.freeze([...new Set(imports)]),
    identifiers,
    themeShellIdentifiers,
    stringLiterals: Object.freeze(stringLiterals),
    unsafeInlineScripts,
    unresolvedDynamicDependencies: Object.freeze(unresolvedDynamicDependencies),
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
  if (/(?:^|[/_-])themes?(?:[/_-]|$)/i.test(value)) return true;
  return value.split("/").some((segment) => {
    const withoutExtension = segment.replace(/[.](?:tsx?|jsx?|mjs|css)$/i, "");
    const normalized = withoutExtension.replace(/[-_.]/g, "").toLowerCase();
    return themeShellName(normalized);
  });
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
      metadata.themeShellIdentifiers.size > 0
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
    for (const detail of metadata.unresolvedDynamicDependencies) {
      findings.push(finding("unresolved_dynamic_dependency", file, detail));
    }
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
