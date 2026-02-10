import type { CompiledTemplate } from "./types.ts";

export class TmlCompileError extends Error {
	filePath: string;
	line: number;

	constructor(message: string, filePath: string, line: number) {
		super(`${message} at ${filePath}:${line}`);
		this.name = "TmlCompileError";
		this.filePath = filePath;
		this.line = line;
	}
}

export class TmlRenderError extends Error {
	filePath: string;
	line: number;

	constructor(message: string, filePath: string, line: number) {
		super(`${message} at ${filePath}:${line}`);
		this.name = "TmlRenderError";
		this.filePath = filePath;
		this.line = line;
	}
}

type BlockType = "if" | "each" | "component" | "head";

const DIRECTIVE_IF = /^@if\((.+)\)$/;
const DIRECTIVE_ELSEIF = /^@elseif\((.+)\)$/;
const DIRECTIVE_ELSE = /^@else$/;
const DIRECTIVE_END = /^@end$/;
const DIRECTIVE_EACH = /^@each\((\w+)\s+of\s+(.+)\)$/;
const DIRECTIVE_INCLUDE = /^@include\(([^,)]+)(?:\s*,\s*(\{.*\}))?\)$/;
const DIRECTIVE_COMPONENT = /^@component\(([^,)]+)(?:\s*,\s*(\{.*\}))?\)$/;
const DIRECTIVE_CHILDREN = /^@children$/;
const DIRECTIVE_PROVIDE = /^@provide\((\w+)\s*,\s*(.+)\)$/;
const DIRECTIVE_HEAD = /^@head$/;
const INLINE_JS = /^<%(.+)%>$/;

const EXPR_RAW = /\{\{\{([\s\S]+?)\}\}\}/g;
const EXPR_ESCAPED = /\{\{([\s\S]+?)\}\}/g;

type Segment =
	| { type: "text"; value: string }
	| { type: "escaped"; value: string }
	| { type: "raw"; value: string }
	| { type: "include"; path: string; props: string | null }
	| { type: "children" };

function findClosingParen(str: string, start: number): number {
	let parenDepth = 1;
	let braceDepth = 0;
	let inString: string | null = null;

	for (let i = start; i < str.length; i++) {
		const ch = str[i];

		if (inString !== null) {
			if (ch === "\\" && i + 1 < str.length) {
				i++;
				continue;
			}
			if (ch === inString) {
				inString = null;
			}
			continue;
		}

		if (ch === '"' || ch === "'") {
			inString = ch;
		} else if (ch === "(") {
			parenDepth++;
		} else if (ch === ")") {
			parenDepth--;
			if (parenDepth === 0) {
				return i;
			}
		} else if (ch === "{") {
			braceDepth++;
		} else if (ch === "}") {
			braceDepth--;
		}
	}

	return -1;
}

function parseIncludeArgs(content: string): {
	path: string;
	props: string | null;
} {
	const commaIndex = content.indexOf(",");
	if (commaIndex === -1) {
		return { path: content.trim(), props: null };
	}
	return {
		path: content.slice(0, commaIndex).trim(),
		props: content.slice(commaIndex + 1).trim(),
	};
}

const WORD_CHAR = /\w/;

function parseInterpolations(text: string): Segment[] {
	const segments: Segment[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		const rawIndex = remaining.indexOf("{{{");
		const escapedIndex = remaining.indexOf("{{");

		let includeIndex = -1;
		{
			let searchFrom = 0;
			while (true) {
				const idx = remaining.indexOf("@include(", searchFrom);
				if (idx === -1) break;
				if (idx > 0 && WORD_CHAR.test(remaining[idx - 1])) {
					searchFrom = idx + 1;
					continue;
				}
				includeIndex = idx;
				break;
			}
		}

		let childrenIndex = -1;
		{
			let searchFrom = 0;
			while (true) {
				const idx = remaining.indexOf("@children", searchFrom);
				if (idx === -1) break;
				if (idx > 0 && WORD_CHAR.test(remaining[idx - 1])) {
					searchFrom = idx + 1;
					continue;
				}
				const afterPos = idx + 9;
				if (
					afterPos < remaining.length &&
					WORD_CHAR.test(remaining[afterPos])
				) {
					searchFrom = idx + 1;
					continue;
				}
				childrenIndex = idx;
				break;
			}
		}

		type Candidate = { pos: number; kind: "raw" | "escaped" | "include" | "children" };
		const candidates: Candidate[] = [];
		if (rawIndex !== -1) candidates.push({ pos: rawIndex, kind: "raw" });
		if (escapedIndex !== -1)
			candidates.push({ pos: escapedIndex, kind: "escaped" });
		if (includeIndex !== -1)
			candidates.push({ pos: includeIndex, kind: "include" });
		if (childrenIndex !== -1)
			candidates.push({ pos: childrenIndex, kind: "children" });

		if (candidates.length === 0) {
			segments.push({ type: "text", value: remaining });
			break;
		}

		candidates.sort((a, b) => {
			if (a.pos !== b.pos) return a.pos - b.pos;
			if (a.kind === "raw" && b.kind === "escaped") return -1;
			if (a.kind === "escaped" && b.kind === "raw") return 1;
			return 0;
		});

		const winner = candidates[0];

		if (winner.pos > 0) {
			segments.push({ type: "text", value: remaining.slice(0, winner.pos) });
		}

		if (winner.kind === "raw") {
			const endIndex = remaining.indexOf("}}}", winner.pos + 3);
			if (endIndex === -1) {
				segments.push({ type: "text", value: remaining.slice(winner.pos) });
				break;
			}
			segments.push({
				type: "raw",
				value: remaining.slice(winner.pos + 3, endIndex).trim(),
			});
			remaining = remaining.slice(endIndex + 3);
		} else if (winner.kind === "escaped") {
			const endIndex = remaining.indexOf("}}", winner.pos + 2);
			if (endIndex === -1) {
				segments.push({ type: "text", value: remaining.slice(winner.pos) });
				break;
			}
			segments.push({
				type: "escaped",
				value: remaining.slice(winner.pos + 2, endIndex).trim(),
			});
			remaining = remaining.slice(endIndex + 2);
		} else if (winner.kind === "include") {
			const openParenPos = winner.pos + 8;
			const closeParenPos = findClosingParen(
				remaining,
				openParenPos + 1,
			);
			if (closeParenPos === -1) {
				segments.push({ type: "text", value: remaining.slice(winner.pos) });
				break;
			}
			const content = remaining.slice(openParenPos + 1, closeParenPos);
			const { path, props } = parseIncludeArgs(content);
			segments.push({ type: "include", path, props });
			remaining = remaining.slice(closeParenPos + 1);
		} else {
			segments.push({ type: "children" });
			remaining = remaining.slice(winner.pos + 9);
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
			case "include":
				if (segment.props) {
					parts.push(
						`__include('${segment.path}', Object.assign({}, __data, ${segment.props}), __context)`,
					);
				} else {
					parts.push(
						`__include('${segment.path}', __data, __context)`,
					);
				}
				break;
			case "children":
				parts.push(`(__children || '')`);
				break;
		}
	}

	return `__out += ${parts.join(" + ")} + '\\n';`;
}

export function compile(template: string, filePath: string): CompiledTemplate {
	const lines = template.split("\n");
	const blockStack: BlockType[] = [];
	const codeParts: string[] = [];
	let inlineJsBuffer: string[] | null = null;
	let inlineJsStartLine = 0;

	codeParts.push("var __out = '';");
	codeParts.push(
		"var __children = (typeof $children !== 'undefined') ? $children : '';",
	);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		const lineNum = i + 1;

		if (inlineJsBuffer !== null) {
			if (trimmed.endsWith("%>")) {
				const before = trimmed.slice(0, -2).trim();
				if (before) inlineJsBuffer.push(before);
				codeParts.push(
					`/* line ${inlineJsStartLine} */ ${inlineJsBuffer.join("\n")}`,
				);
				inlineJsBuffer = null;
			} else {
				inlineJsBuffer.push(line);
			}
			continue;
		}

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
			} else if (block === "component" || block === "head") {
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

		if (DIRECTIVE_HEAD.test(trimmed)) {
			codeParts.push(
				`/* line ${lineNum} */ __head(function() { var __out = '';`,
			);
			blockStack.push("head");
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

		if (trimmed.startsWith("<%")) {
			inlineJsStartLine = lineNum;
			const after = trimmed.slice(2).trim();
			inlineJsBuffer = after ? [after] : [];
			continue;
		}

		codeParts.push(compileLineWithInterpolations(line));
	}

	if (inlineJsBuffer !== null) {
		throw new TmlCompileError(
			"Unclosed <% block - missing %>",
			filePath,
			inlineJsStartLine,
		);
	}

	if (blockStack.length > 0) {
		const unclosed = blockStack[blockStack.length - 1];
		throw new TmlCompileError(
			`Unclosed @${unclosed} block - missing @end`,
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
			"__head",
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
