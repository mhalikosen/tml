import path from "node:path";
import { buildInlineAssets, injectAssets, TmlEngine } from "./engine.ts";
import { extractRenderData } from "./helpers.ts";
import type { AssetTags, ExpressViewEngine, RenderCollector } from "./types.ts";

export interface TmlExpressOptions {
	viewsDir: string;
	cache?: boolean;
	onAssets?: (collector: RenderCollector) => AssetTags;
}

export function createViewEngine(
	engineOptions: TmlExpressOptions,
): ExpressViewEngine {
	const viewsDir = path.resolve(engineOptions.viewsDir);
	const shouldCache =
		engineOptions.cache ?? process.env.NODE_ENV === "production";

	const engine = new TmlEngine({ viewsDir, cache: shouldCache });

	return async (
		filePath: string,
		options: Record<string, unknown>,
		callback: (err: Error | null, rendered?: string) => void,
	) => {
		try {
			const { relativePath, data, context } = extractRenderData(viewsDir, filePath, options);

			const { html, collector } = engine.renderPage(
				relativePath,
				data,
				context,
			);

			let finalHtml = html;

			if (engineOptions.onAssets) {
				const assetTags = engineOptions.onAssets(collector);
				finalHtml = injectAssets(finalHtml, assetTags);
			} else {
				const inlineAssets = await buildInlineAssets(collector);
				finalHtml = injectAssets(finalHtml, inlineAssets);
			}

			callback(null, finalHtml);
		} catch (error) {
			callback(error as Error);
		}
	};
}
