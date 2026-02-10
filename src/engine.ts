import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { compile, TmlCompileError, TmlRenderError } from "./compiler.ts";
import { escapeHtml, safePath } from "./helpers.ts";
import { parse } from "./parser.ts";
import type { InjectAssetsOptions, RenderResult } from "./types.ts";

const MAX_RENDER_DEPTH = 100;

interface Collector {
	styles: Map<string, string>;
	scripts: Map<string, string>;
	headTags: Map<string, string>;
}

export function render(
	viewsDir: string,
	viewPath: string,
	data: Record<string, unknown> = {},
): RenderResult {
	const resolvedViewsDir = path.resolve(viewsDir);

	if (!fs.existsSync(resolvedViewsDir)) {
		throw new Error(`Views directory does not exist: ${resolvedViewsDir}`);
	}

	const collector: Collector = {
		styles: new Map(),
		scripts: new Map(),
		headTags: new Map(),
	};

	let renderDepth = 0;

	function renderComponent(
		componentPath: string,
		componentData: Record<string, unknown>,
		context: Record<string, unknown>,
		children?: string,
	): string {
		if (renderDepth >= MAX_RENDER_DEPTH) {
			throw new TmlRenderError(
				`Maximum render depth (${MAX_RENDER_DEPTH}) exceeded - possible circular component reference`,
				componentPath,
				0,
			);
		}

		renderDepth++;
		try {
			const fullPath = safePath(resolvedViewsDir, componentPath);
			if (!fs.existsSync(fullPath)) {
				throw new Error(
					`Template not found: ${componentPath} (resolved to ${fullPath})`,
				);
			}

			const source = fs.readFileSync(fullPath, "utf-8");
			const parsed = parse(source);
			const compiled = compile(parsed.template, componentPath);

			if (parsed.style) {
				collector.styles.set(componentPath, parsed.style);
			}
			if (parsed.script) {
				collector.scripts.set(componentPath, parsed.script);
			}

			const dataWithChildren: Record<string, unknown> =
				children !== undefined
					? { ...componentData, $children: children }
					: { ...componentData };

			const includeHandler = (
				includePath: string,
				includeData: Record<string, unknown>,
				includeContext: Record<string, unknown>,
			): string => {
				return renderComponent(includePath, includeData, includeContext);
			};

			const componentHandler = (
				compPath: string,
				compData: Record<string, unknown>,
				compContext: Record<string, unknown>,
				childrenFn: () => string,
			): string => {
				const childrenHtml = childrenFn();
				return renderComponent(
					compPath,
					compData,
					compContext,
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
				if (
					error instanceof TmlCompileError ||
					error instanceof TmlRenderError
				) {
					throw error;
				}

				const message = (error as Error).message || String(error);
				throw new TmlRenderError(message, componentPath, 0);
			}
		} finally {
			renderDepth--;
		}
	}

	const html = renderComponent(viewPath, data, {});

	let finalHtml = html;
	if (collector.headTags.size > 0) {
		const seen = new Set<string>();
		const uniqueTags: string[] = [];
		for (const tag of collector.headTags.values()) {
			const trimmed = tag.trim();
			if (trimmed && !seen.has(trimmed)) {
				seen.add(trimmed);
				uniqueTags.push(trimmed);
			}
		}

		const headCloseIndex = finalHtml.indexOf("</head>");
		if (headCloseIndex === -1) {
			throw new TmlRenderError(
				"@head directive requires a </head> tag in the document",
				viewPath,
				0,
			);
		}
		const headInsert = `${uniqueTags.join("\n")}\n`;
		finalHtml =
			finalHtml.slice(0, headCloseIndex) +
			headInsert +
			finalHtml.slice(headCloseIndex);
	}

	let css = "";
	if (collector.styles.size > 0) {
		const allCss = Array.from(collector.styles.values()).join("\n");
		const result = esbuild.transformSync(allCss, {
			loader: "css",
			minify: true,
		});
		css = result.code.trim();
	}

	let js = "";
	if (collector.scripts.size > 0) {
		const bundled = Array.from(collector.scripts.values()).map((script) => {
			const result = esbuild.buildSync({
				stdin: {
					contents: script,
					resolveDir: process.cwd(),
					loader: "js",
				},
				bundle: true,
				write: false,
				format: "iife",
				minify: true,
				platform: "browser",
			});
			return result.outputFiles[0].text.trim();
		});
		js = bundled.join("\n");
	}

	return { html: finalHtml, css, js };
}

export function injectAssets(
	html: string,
	options: InjectAssetsOptions,
): string {
	let result = html;

	if (options.css) {
		const headCloseIndex = result.indexOf("</head>");
		if (headCloseIndex === -1) {
			throw new Error(
				"Cannot inject CSS: </head> tag not found in the document",
			);
		}
		result =
			result.slice(0, headCloseIndex) +
			options.css +
			"\n" +
			result.slice(headCloseIndex);
	}

	if (options.js) {
		const bodyCloseIndex = result.indexOf("</body>");
		if (bodyCloseIndex === -1) {
			throw new Error(
				"Cannot inject JS: </body> tag not found in the document",
			);
		}
		result =
			result.slice(0, bodyCloseIndex) +
			options.js +
			"\n" +
			result.slice(bodyCloseIndex);
	}

	return result;
}
