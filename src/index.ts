import fs from "node:fs";
import path from "node:path";
import { compile, TmlCompileError, TmlRenderError } from "./compiler.ts";
import { escapeHtml, safePath } from "./helpers.ts";
import { parse } from "./parser.ts";
import type {
  CompiledTemplate,
  ParsedComponent,
  RenderCollector,
  RenderResult,
  TemplateCache,
} from "./types.ts";

export { TmlCompileError, TmlRenderError } from "./compiler.ts";
export type {
  AssetTags,
  CompiledTemplate,
  ParsedComponent,
  RenderCollector,
  RenderResult,
  TmlEngineOptions,
} from "./types.ts";

let viewsDir = "";
let cacheEnabled = false;

const templateCache: TemplateCache = new Map();
const parsedCache: Map<string, ParsedComponent> = new Map();
const cssRegistry: Map<string, string> = new Map();
const jsRegistry: Map<string, string> = new Map();

export function initRegistry(dir: string, cache = false): void {
  viewsDir = path.resolve(dir);
  cacheEnabled = cache;

  templateCache.clear();
  parsedCache.clear();
  cssRegistry.clear();
  jsRegistry.clear();

  scanDirectory(viewsDir);
}

function scanDirectory(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.name.endsWith(".tml")) {
      const source = fs.readFileSync(fullPath, "utf-8");
      const parsed = parse(source);
      const relativePath = path.relative(viewsDir, fullPath).replace(/\.tml$/, "");

      parsedCache.set(relativePath, parsed);

      if (parsed.style) {
        cssRegistry.set(relativePath, parsed.style);
      }
      if (parsed.script) {
        jsRegistry.set(relativePath, parsed.script);
      }

      if (cacheEnabled) {
        const compiled = compile(parsed.template, relativePath);
        templateCache.set(relativePath, compiled);
      }
    }
  }
}

export function getCSS(filePath: string): string | undefined {
  return cssRegistry.get(filePath);
}

export function getJS(filePath: string): string | undefined {
  return jsRegistry.get(filePath);
}

export function getAllCSS(): Map<string, string> {
  return new Map(cssRegistry);
}

export function getAllJS(): Map<string, string> {
  return new Map(jsRegistry);
}

function getParsed(componentPath: string): ParsedComponent {
  const cached = parsedCache.get(componentPath);
  if (cached) {
    return cached;
  }

  const fullPath = safePath(viewsDir, componentPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Template not found: ${componentPath} (resolved to ${fullPath})`);
  }

  const source = fs.readFileSync(fullPath, "utf-8");
  const parsed = parse(source);
  parsedCache.set(componentPath, parsed);

  if (parsed.style) {
    cssRegistry.set(componentPath, parsed.style);
  }
  if (parsed.script) {
    jsRegistry.set(componentPath, parsed.script);
  }

  return parsed;
}

function getCompiled(componentPath: string): CompiledTemplate {
  if (cacheEnabled) {
    const cached = templateCache.get(componentPath);
    if (cached) {
      return cached;
    }
  }

  const parsed = getParsed(componentPath);
  const compiled = compile(parsed.template, componentPath);

  if (cacheEnabled) {
    templateCache.set(componentPath, compiled);
  }

  return compiled;
}

export function renderComponent(
  componentPath: string,
  data: Record<string, unknown>,
  context: Record<string, unknown>,
  collector: RenderCollector,
  children?: string,
): string {
  const compiled = getCompiled(componentPath);

  const parsed = getParsed(componentPath);
  if (parsed.style) {
    collector.styles.set(componentPath, parsed.style);
  }
  if (parsed.script) {
    collector.scripts.set(componentPath, parsed.script);
  }

  const dataWithChildren: Record<string, unknown> = children !== undefined
    ? { ...data, $children: children }
    : { ...data };

  const includeHandler = (
    includePath: string,
    includeData: Record<string, unknown>,
    includeContext: Record<string, unknown>,
  ): string => {
    return renderComponent(includePath, includeData, includeContext, collector);
  };

  const componentHandler = (
    compPath: string,
    compData: Record<string, unknown>,
    compContext: Record<string, unknown>,
    childrenFn: () => string,
  ): string => {
    const childrenHtml = childrenFn();
    return renderComponent(compPath, compData, compContext, collector, childrenHtml);
  };

  try {
    return compiled(dataWithChildren, escapeHtml, includeHandler, componentHandler, context);
  } catch (error) {
    if (error instanceof TmlCompileError || error instanceof TmlRenderError) {
      throw error;
    }

    const message = (error as Error).message || String(error);
    throw new TmlRenderError(message, componentPath, 0);
  }
}

export function renderPage(
  pagePath: string,
  data: Record<string, unknown>,
  context: Record<string, unknown> = {},
): RenderResult {
  const collector: RenderCollector = {
    styles: new Map(),
    scripts: new Map(),
  };

  const html = renderComponent(pagePath, data, context, collector);

  return { html, collector };
}

export function clearCache(): void {
  templateCache.clear();
  parsedCache.clear();
}
