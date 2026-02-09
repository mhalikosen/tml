import type { CompiledTemplate } from "./types.ts";

export class TmlCompileError extends Error {
	filePath: string;
	line: number;

	constructor(message: string, filePath: string, line: number) {
		super(`TmlCompileError: ${message} at ${filePath}:${line}`);
		this.name = "TmlCompileError";
		this.filePath = filePath;
		this.line = line;
	}
}

export class TmlRenderError extends Error {
	filePath: string;
	line: number;

	constructor(message: string, filePath: string, line: number) {
		super(`TmlRenderError: ${message} at ${filePath}:${line}`);
		this.name = "TmlRenderError";
		this.filePath = filePath;
		this.line = line;
	}
}

type BlockType = "if" | "each" | "component";

const DIRECTIVE_IF = /^@if\((.+)\)$/;
const DIRECTIVE_ELSEIF = /^@elseif\((.+)\)$/;
const DIRECTIVE_ELSE = /^@else$/;
const DIRECTIVE_END = /^@end$/;
const DIRECTIVE_EACH = /^@each\((\w+)\s+of\s+(.+)\)$/;
const DIRECTIVE_INCLUDE = /^@include\(([^,)]+)(?:\s*,\s*(\{.*\}))?\)$/;
const DIRECTIVE_COMPONENT = /^@component\(([^,)]+)(?:\s*,\s*(\{.*\}))?\)$/;
const DIRECTIVE_CHILDREN = /^@children$/;
const DIRECTIVE_PROVIDE = /^@provide\((\w+)\s*,\s*(.+)\)$/;
const INLINE_JS = /^<%(.+)%>$/;

const EXPR_RAW = /\{\{\{([\s\S]+?)\}\}\}/g;
const EXPR_ESCAPED = /\{\{([\s\S]+?)\}\}/g;

interface TextSegment {
	type: "text" | "escaped" | "raw";
	value: string;
}

function parseInterpolations(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		const rawIndex = remaining.indexOf("{{{");
		const escapedIndex = remaining.indexOf("{{");

		if (rawIndex === -1 && escapedIndex === -1) {
			segments.push({ type: "text", value: remaining });
			break;
		}

		const isRaw =
			rawIndex !== -1 && (escapedIndex === -1 || rawIndex <= escapedIndex);

		if (isRaw) {
			if (rawIndex > 0) {
				segments.push({ type: "text", value: remaining.slice(0, rawIndex) });
			}
			const endIndex = remaining.indexOf("}}}", rawIndex + 3);
			if (endIndex === -1) {
				segments.push({ type: "text", value: remaining.slice(rawIndex) });
				break;
			}
			segments.push({
				type: "raw",
				value: remaining.slice(rawIndex + 3, endIndex).trim(),
			});
			remaining = remaining.slice(endIndex + 3);
		} else {
			if (escapedIndex > 0) {
				segments.push({
					type: "text",
					value: remaining.slice(0, escapedIndex),
				});
			}
			const endIndex = remaining.indexOf("}}", escapedIndex + 2);
			if (endIndex === -1) {
				segments.push({ type: "text", value: remaining.slice(escapedIndex) });
				break;
			}
			segments.push({
				type: "escaped",
				value: remaining.slice(escapedIndex + 2, endIndex).trim(),
			});
			remaining = remaining.slice(endIndex + 2);
		}
	}

	return segments;
}

function compileLineWithInterpolations(line: string): string {
	const segments = parseInterpolations(line);

	if (segments.length === 1 && segments[0].type === "text") {
		return `__out += '${escapeJsString(segments[0].value)}\\n';`;
	}

	const parts: string[] = [];
	for (const segment of segments) {
		switch (segment.type) {
			case "text":
				parts.push(`'${escapeJsString(segment.value)}'`);
				break;
			case "escaped":
				parts.push(`__escape(${segment.value})`);
				break;
			case "raw":
				parts.push(`(${segment.value})`);
				break;
		}
	}

	return `__out += ${parts.join(" + ")} + '\\n';`;
}

export function compile(template: string, filePath: string): CompiledTemplate {
	const lines = template.split("\n");
	const blockStack: BlockType[] = [];
	const codeParts: string[] = [];

	codeParts.push("var __out = '';");
	codeParts.push(
		"var __children = (typeof $children !== 'undefined') ? $children : '';",
	);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		const lineNum = i + 1;

		if (trimmed === "") {
			codeParts.push("__out += '\\n';");
			continue;
		}

		let match: RegExpMatchArray | null;

		match = trimmed.match(DIRECTIVE_IF);
		if (match) {
			codeParts.push(`/* line ${lineNum} */ if (${match[1]}) {`);
			blockStack.push("if");
			continue;
		}

		match = trimmed.match(DIRECTIVE_ELSEIF);
		if (match) {
			if (blockStack[blockStack.length - 1] !== "if") {
				throw new TmlCompileError(
					"@elseif without matching @if",
					filePath,
					lineNum,
				);
			}
			codeParts.push(`/* line ${lineNum} */ } else if (${match[1]}) {`);
			continue;
		}

		if (DIRECTIVE_ELSE.test(trimmed)) {
			if (blockStack[blockStack.length - 1] !== "if") {
				throw new TmlCompileError(
					"@else without matching @if",
					filePath,
					lineNum,
				);
			}
			codeParts.push(`/* line ${lineNum} */ } else {`);
			continue;
		}

		if (DIRECTIVE_END.test(trimmed)) {
			const block = blockStack.pop();
			if (!block) {
				throw new TmlCompileError(
					"Unexpected @end without matching block",
					filePath,
					lineNum,
				);
			}
			if (block === "each") {
				codeParts.push(`/* line ${lineNum} */ $index++; } }`);
			} else if (block === "component") {
				codeParts.push(`/* line ${lineNum} */ return __out; });`);
			} else {
				codeParts.push(`/* line ${lineNum} */ }`);
			}
			continue;
		}

		match = trimmed.match(DIRECTIVE_EACH);
		if (match) {
			const itemName = match[1];
			const iterableExpr = match[2];
			codeParts.push(
				`/* line ${lineNum} */ { var $index = 0; for (var ${itemName} of (${iterableExpr})) {`,
			);
			blockStack.push("each");
			continue;
		}

		match = trimmed.match(DIRECTIVE_INCLUDE);
		if (match) {
			const includePath = match[1].trim();
			const propsExpr = match[2] ? match[2].trim() : null;
			if (propsExpr) {
				codeParts.push(
					`/* line ${lineNum} */ __out += __include('${includePath}', Object.assign({}, __data, ${propsExpr}), __context);`,
				);
			} else {
				codeParts.push(
					`/* line ${lineNum} */ __out += __include('${includePath}', __data, __context);`,
				);
			}
			continue;
		}

		match = trimmed.match(DIRECTIVE_COMPONENT);
		if (match) {
			const componentPath = match[1].trim();
			const propsExpr = match[2] ? match[2].trim() : null;
			if (propsExpr) {
				codeParts.push(
					`/* line ${lineNum} */ __out += __component('${componentPath}', Object.assign({}, __data, ${propsExpr}), __context, function() { var __out = '';`,
				);
			} else {
				codeParts.push(
					`/* line ${lineNum} */ __out += __component('${componentPath}', __data, __context, function() { var __out = '';`,
				);
			}
			blockStack.push("component");
			continue;
		}

		if (DIRECTIVE_CHILDREN.test(trimmed)) {
			codeParts.push(`/* line ${lineNum} */ __out += (__children || '');`);
			continue;
		}

		match = trimmed.match(DIRECTIVE_PROVIDE);
		if (match) {
			const key = match[1];
			const expr = match[2];
			codeParts.push(
				`/* line ${lineNum} */ __context = Object.assign({}, __context, { ${key}: (${expr}) }); $context = __context;`,
			);
			continue;
		}

		match = trimmed.match(INLINE_JS);
		if (match) {
			codeParts.push(`/* line ${lineNum} */ ${match[1].trim()}`);
			continue;
		}

		codeParts.push(compileLineWithInterpolations(line));
	}

	if (blockStack.length > 0) {
		const unclosed = blockStack[blockStack.length - 1];
		throw new TmlCompileError(
			`Unclosed @${unclosed} block — missing @end`,
			filePath,
			lines.length,
		);
	}

	codeParts.push("return __out;");

	const fnBody = codeParts.join("\n");

	try {
		const wrappedBody = [
			"__data = Object.assign({}, __data, { $context: __context });",
			`with (__data) {`,
			fnBody,
			`}`,
		].join("\n");

		const fn = new Function(
			"__data",
			"__escape",
			"__include",
			"__component",
			"__context",
			wrappedBody,
		) as CompiledTemplate;
		return fn;
	} catch (error) {
		throw new TmlCompileError(
			`Compilation failed: ${(error as Error).message}`,
			filePath,
			0,
		);
	}
}

function escapeJsString(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n");
}
