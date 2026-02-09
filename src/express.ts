import path from "node:path";
import type { Request, Response } from "express";
import { initRegistry, renderPage } from "./index.ts";
import type { AssetTags, RenderCollector, TmlEngineOptions } from "./types.ts";

type ExpressViewEngine = (
  filePath: string,
  options: Record<string, unknown>,
  callback: (err: Error | null, rendered?: string) => void,
) => void;

export function createViewEngine(engineOptions: TmlEngineOptions): ExpressViewEngine {
  const viewsDir = path.resolve(engineOptions.viewsDir);
  const shouldCache = engineOptions.cache ?? process.env.NODE_ENV === "production";

  initRegistry(viewsDir, shouldCache);

  return (filePath: string, options: Record<string, unknown>, callback) => {
    try {
      const relativePath = path
        .relative(viewsDir, filePath)
        .replace(/\.tml$/, "");

      const { settings: _settings, _locals, cache: _cache, ...data } = options;

      const context = (data.$context as Record<string, unknown>) || {};
      delete data.$context;

      const { html, collector } = renderPage(relativePath, data, context);

      let finalHtml = html;

      if (engineOptions.onAssets) {
        const assetTags = engineOptions.onAssets(collector);
        finalHtml = injectAssets(finalHtml, assetTags);
      } else {
        const inlineAssets = buildInlineAssets(collector);
        finalHtml = injectAssets(finalHtml, inlineAssets);
      }

      callback(null, finalHtml);
    } catch (error) {
      callback(error as Error);
    }
  };
}

function buildInlineAssets(collector: RenderCollector): AssetTags {
  let cssTag = "";
  let jsTag = "";

  if (collector.styles.size > 0) {
    const allCss = Array.from(collector.styles.values()).join("\n\n");
    cssTag = `<style>\n${allCss}\n</style>`;
  }

  if (collector.scripts.size > 0) {
    const allJs = Array.from(collector.scripts.values()).join("\n\n");
    jsTag = `<script>\n${allJs}\n</script>`;
  }

  return { cssTag, jsTag };
}

function injectAssets(html: string, assets: AssetTags): string {
  let result = html;

  if (assets.cssTag) {
    const headCloseIndex = result.indexOf("</head>");
    if (headCloseIndex !== -1) {
      result = `${result.slice(0, headCloseIndex)}${assets.cssTag}\n${result.slice(headCloseIndex)}`;
    }
  }

  if (assets.jsTag) {
    const bodyCloseIndex = result.indexOf("</body>");
    if (bodyCloseIndex !== -1) {
      result = `${result.slice(0, bodyCloseIndex)}${assets.jsTag}\n${result.slice(bodyCloseIndex)}`;
    }
  }

  return result;
}
