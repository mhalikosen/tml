import path from "node:path";

const HTML_ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeHtml(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}

	const str = String(value);
	return str.replace(
		HTML_ESCAPE_REGEX,
		(char) => HTML_ESCAPE_MAP[char] as string,
	);
}

export function extractRenderData(
	viewsDir: string,
	filePath: string,
	options: Record<string, unknown>,
): { relativePath: string; data: Record<string, unknown>; context: Record<string, unknown> } {
	const relativePath = path.relative(viewsDir, filePath).replace(/\.tml$/, "");
	const { settings: _settings, _locals, cache: _cache, ...data } = options;
	const context = (data.$context as Record<string, unknown>) || {};
	delete data.$context;
	return { relativePath, data, context };
}

export function safePath(baseDir: string, name: string): string {
	const resolved = path.resolve(baseDir, `${name}.tml`);
	const normalizedBase = path.resolve(baseDir);

	if (
		!resolved.startsWith(`${normalizedBase}${path.sep}`) &&
		resolved !== normalizedBase
	) {
		throw new Error(
			`Path traversal detected: "${name}" resolves outside of views directory`,
		);
	}

	return resolved;
}
