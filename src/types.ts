export interface ParsedComponent {
	template: string;
	style: string;
	script: string;
}

export interface RenderCollector {
	styles: Map<string, string>;
	scripts: Map<string, string>;
	headTags: Map<string, string>;
}

export interface RenderResult {
	html: string;
	collector: RenderCollector;
}

export interface TmlEngineConfig {
	viewsDir: string;
	cache?: boolean;
}

export interface AssetTags {
	headTag: string;
	cssTag: string;
	jsTag: string;
}

export type CompiledTemplate = (
	data: Record<string, unknown>,
	escape: (value: unknown) => string,
	include: (
		path: string,
		data: Record<string, unknown>,
		context: Record<string, unknown>,
	) => string,
	component: (
		path: string,
		data: Record<string, unknown>,
		context: Record<string, unknown>,
		childrenFn: () => string,
	) => string,
	context: Record<string, unknown>,
	head: (fn: () => string) => void,
) => string;

export type TemplateCache = Map<string, CompiledTemplate>;

export type ExpressViewEngine = (
	filePath: string,
	options: Record<string, unknown>,
	callback: (err: Error | null, rendered?: string) => void,
) => void;
