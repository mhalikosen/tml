import fs from "node:fs";
import path from "node:path";
import { compile, TmlCompileError, TmlRenderError } from "./compiler.ts";
import { escapeHtml, safePath } from "./helpers.ts";
import { parse } from "./parser.ts";
import type {
	AssetTags,
	CompiledTemplate,
	ParsedComponent,
	RenderCollector,
	RenderResult,
	TemplateCache,
	TmlEngineConfig,
} from "./types.ts";

export class TmlEngine {
	private viewsDir: string;
	private cacheEnabled: boolean;
	private initialized: boolean;
	private templateCache: TemplateCache;
	private parsedCache: Map<string, ParsedComponent>;
	private cssRegistry: Map<string, string>;
	private jsRegistry: Map<string, string>;

	constructor(config?: TmlEngineConfig) {
		this.viewsDir = "";
		this.cacheEnabled = false;
		this.initialized = false;
		this.templateCache = new Map();
		this.parsedCache = new Map();
		this.cssRegistry = new Map();
		this.jsRegistry = new Map();

		if (config) {
			this.configure(config);
		}
	}

	configure(config: TmlEngineConfig): void {
		this.viewsDir = path.resolve(config.viewsDir);
		this.cacheEnabled = config.cache ?? false;

		this.templateCache.clear();
		this.parsedCache.clear();
		this.cssRegistry.clear();
		this.jsRegistry.clear();

		this.scan();
	}

	renderPage(
		pagePath: string,
		data: Record<string, unknown> = {},
		context: Record<string, unknown> = {},
	): RenderResult {
		const collector: RenderCollector = {
			styles: new Map(),
			scripts: new Map(),
			headTags: new Map(),
		};

		const html = this.renderComponent(pagePath, data, context, collector);

		return { html, collector };
	}

	renderFile(
		filePath: string,
		options: Record<string, unknown>,
		callback: (err: Error | null, rendered?: string) => void,
	): void {
		try {
			this.ensureInitialized(filePath, options);

			const relativePath = path
				.relative(this.viewsDir, filePath)
				.replace(/\.tml$/, "");

			const { settings: _settings, _locals, cache: _cache, ...data } = options;

			const context = (data.$context as Record<string, unknown>) || {};
			delete data.$context;

			const { html, collector } = this.renderPage(relativePath, data, context);

			const inlineAssets = buildInlineAssets(collector);
			const finalHtml = injectAssets(html, inlineAssets);

			callback(null, finalHtml);
		} catch (error) {
			callback(error as Error);
		}
	}

	renderComponent(
		componentPath: string,
		data: Record<string, unknown>,
		context: Record<string, unknown>,
		collector: RenderCollector,
		children?: string,
	): string {
		const compiled = this.getCompiled(componentPath);

		const parsed = this.getParsed(componentPath);
		if (parsed.style) {
			collector.styles.set(componentPath, parsed.style);
		}
		if (parsed.script) {
			collector.scripts.set(componentPath, parsed.script);
		}

		const dataWithChildren: Record<string, unknown> =
			children !== undefined ? { ...data, $children: children } : { ...data };

		const includeHandler = (
			includePath: string,
			includeData: Record<string, unknown>,
			includeContext: Record<string, unknown>,
		): string => {
			return this.renderComponent(
				includePath,
				includeData,
				includeContext,
				collector,
			);
		};

		const componentHandler = (
			compPath: string,
			compData: Record<string, unknown>,
			compContext: Record<string, unknown>,
			childrenFn: () => string,
		): string => {
			const childrenHtml = childrenFn();
			return this.renderComponent(
				compPath,
				compData,
				compContext,
				collector,
				childrenHtml,
			);
		};

		const headHandler = (fn: () => string): void => {
			const result = fn();
			if (result) {
				collector.headTags.set(componentPath, result);
			}
		};

		try {
			return compiled(
				dataWithChildren,
				escapeHtml,
				includeHandler,
				componentHandler,
				context,
				headHandler,
			);
		} catch (error) {
			if (error instanceof TmlCompileError || error instanceof TmlRenderError) {
				throw error;
			}

			const message = (error as Error).message || String(error);
			throw new TmlRenderError(message, componentPath, 0);
		}
	}

	getCSS(filePath: string): string | undefined {
		return this.cssRegistry.get(filePath);
	}

	getJS(filePath: string): string | undefined {
		return this.jsRegistry.get(filePath);
	}

	getAllCSS(): Map<string, string> {
		return new Map(this.cssRegistry);
	}

	getAllJS(): Map<string, string> {
		return new Map(this.jsRegistry);
	}

	clearCache(): void {
		this.templateCache.clear();
		this.parsedCache.clear();
	}

	private ensureInitialized(
		_filePath?: string,
		options?: Record<string, unknown>,
	): void {
		if (this.initialized) {
			return;
		}

		const settings = options?.settings as Record<string, unknown> | undefined;

		if (settings?.views) {
			const viewsDir = String(settings.views);
			const shouldCache =
				settings["view cache"] !== undefined
					? Boolean(settings["view cache"])
					: false;

			this.configure({ viewsDir, cache: shouldCache });
			this.initialized = true;
			return;
		}

		if (this.viewsDir) {
			this.initialized = true;
			return;
		}

		throw new Error(
			"TmlEngine is not configured. Call configure({ viewsDir }) or use with Express (app.set('views', dir)).",
		);
	}

	private scan(): void {
		this.scanDirectory(this.viewsDir);
		this.initialized = true;
	}

	private scanDirectory(dir: string): void {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				this.scanDirectory(fullPath);
			} else if (entry.name.endsWith(".tml")) {
				const source = fs.readFileSync(fullPath, "utf-8");
				const parsed = parse(source);
				const relativePath = path
					.relative(this.viewsDir, fullPath)
					.replace(/\.tml$/, "");

				this.parsedCache.set(relativePath, parsed);

				if (parsed.style) {
					this.cssRegistry.set(relativePath, parsed.style);
				}
				if (parsed.script) {
					this.jsRegistry.set(relativePath, parsed.script);
				}

				if (this.cacheEnabled) {
					const compiled = compile(parsed.template, relativePath);
					this.templateCache.set(relativePath, compiled);
				}
			}
		}
	}

	private getParsed(componentPath: string): ParsedComponent {
		const cached = this.parsedCache.get(componentPath);
		if (cached) {
			return cached;
		}

		const fullPath = safePath(this.viewsDir, componentPath);
		if (!fs.existsSync(fullPath)) {
			throw new Error(
				`Template not found: ${componentPath} (resolved to ${fullPath})`,
			);
		}

		const source = fs.readFileSync(fullPath, "utf-8");
		const parsed = parse(source);
		this.parsedCache.set(componentPath, parsed);

		if (parsed.style) {
			this.cssRegistry.set(componentPath, parsed.style);
		}
		if (parsed.script) {
			this.jsRegistry.set(componentPath, parsed.script);
		}

		return parsed;
	}

	private getCompiled(componentPath: string): CompiledTemplate {
		if (this.cacheEnabled) {
			const cached = this.templateCache.get(componentPath);
			if (cached) {
				return cached;
			}
		}

		const parsed = this.getParsed(componentPath);
		const compiled = compile(parsed.template, componentPath);

		if (this.cacheEnabled) {
			this.templateCache.set(componentPath, compiled);
		}

		return compiled;
	}
}

export function buildInlineAssets(collector: RenderCollector): AssetTags {
	let headTag = "";
	let cssTag = "";
	let jsTag = "";

	if (collector.headTags.size > 0) {
		headTag = Array.from(collector.headTags.values()).join("\n");
	}

	if (collector.styles.size > 0) {
		const allCss = Array.from(collector.styles.values()).join("\n\n");
		cssTag = `<style>\n${allCss}\n</style>`;
	}

	if (collector.scripts.size > 0) {
		const allJs = Array.from(collector.scripts.values()).join("\n\n");
		jsTag = `<script>\n${allJs}\n</script>`;
	}

	return { headTag, cssTag, jsTag };
}

export function injectAssets(html: string, assets: AssetTags): string {
	let result = html;

	const headCloseIndex = result.indexOf("</head>");
	if (headCloseIndex !== -1) {
		let headInsert = "";
		if (assets.headTag) {
			headInsert += `${assets.headTag}\n`;
		}
		if (assets.cssTag) {
			headInsert += `${assets.cssTag}\n`;
		}
		if (headInsert) {
			result = `${result.slice(0, headCloseIndex)}${headInsert}${result.slice(headCloseIndex)}`;
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
