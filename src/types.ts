export interface ParsedComponent {
  template: string;
  style: string;
  script: string;
}

export interface RenderCollector {
  styles: Map<string, string>;
  scripts: Map<string, string>;
}

export interface RenderResult {
  html: string;
  collector: RenderCollector;
}

export interface TmlEngineOptions {
  viewsDir: string;
  cache?: boolean;
  onAssets?: (collector: RenderCollector) => AssetTags;
}

export interface AssetTags {
  cssTag: string;
  jsTag: string;
}

export type CompiledTemplate = (
  data: Record<string, unknown>,
  escape: (value: unknown) => string,
  include: (path: string, data: Record<string, unknown>) => string,
  component: (
    path: string,
    data: Record<string, unknown>,
    childrenFn: () => string,
  ) => string,
  context: Record<string, unknown>,
) => string;

export type TemplateCache = Map<string, CompiledTemplate>;
