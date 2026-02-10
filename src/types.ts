export interface ParsedComponent {
	template: string;
	style: string;
	script: string;
}

export interface RenderResult {
	html: string;
	css: string;
	js: string;
}

export interface InjectAssetsOptions {
	css?: string;
	js?: string;
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
