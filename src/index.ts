import { TmlEngine } from "./engine.ts";

export { TmlCompileError, TmlRenderError } from "./compiler.ts";
export { buildInlineAssets, injectAssets, TmlEngine } from "./engine.ts";
export type {
	AssetTags,
	CompiledTemplate,
	ExpressViewEngine,
	ParsedComponent,
	RenderCollector,
	RenderResult,
	TemplateCache,
	TmlEngineConfig,
} from "./types.ts";

// Default singleton
const defaultEngine = new TmlEngine();

// Bound methods for convenience
export const configure = defaultEngine.configure.bind(defaultEngine);
export const renderPage = defaultEngine.renderPage.bind(defaultEngine);
export const renderFile = defaultEngine.renderFile.bind(defaultEngine);
export const renderComponent =
	defaultEngine.renderComponent.bind(defaultEngine);
export const clearCache = defaultEngine.clearCache.bind(defaultEngine);
export const getCSS = defaultEngine.getCSS.bind(defaultEngine);
export const getJS = defaultEngine.getJS.bind(defaultEngine);
export const getAllCSS = defaultEngine.getAllCSS.bind(defaultEngine);
export const getAllJS = defaultEngine.getAllJS.bind(defaultEngine);

// Express auto-discovery convention
export const __express = renderFile;
