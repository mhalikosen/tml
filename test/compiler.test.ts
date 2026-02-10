import { describe, expect, it } from "vitest";
import { compile, TmlCompileError } from "../src/compiler.ts";
import { escapeHtml } from "../src/helpers.ts";

function render(
	template: string,
	data: Record<string, unknown> = {},
	options: {
		include?: (path: string, data: Record<string, unknown>, context: Record<string, unknown>) => string;
		component?: (path: string, data: Record<string, unknown>, context: Record<string, unknown>, childrenFn: () => string) => string;
		context?: Record<string, unknown>;
		head?: (fn: () => string) => void;
	} = {},
): string {
	const fn = compile(template, "test.tml");
	const includeHandler = options.include ?? (() => "");
	const componentHandler = options.component ?? (() => "");
	const context = options.context ?? {};
	const headHandler = options.head ?? (() => {});
	return fn(data, escapeHtml, includeHandler, componentHandler, context, headHandler);
}

describe("compile", () => {
	describe("plain text", () => {
		it("renders plain text", () => {
			const result = render("<p>Hello</p>");
			expect(result).toContain("<p>Hello</p>");
		});

		it("renders empty template", () => {
			const result = render("");
			expect(result).toBe("\n");
		});

		it("preserves whitespace-only lines as newlines", () => {
			const result = render("a\n\nb");
			expect(result).toBe("a\n\nb\n");
		});
	});

	describe("interpolation", () => {
		it("escapes {{ expr }}", () => {
			const result = render("<p>{{ name }}</p>", { name: "<b>bold</b>" });
			expect(result).toContain("&lt;b&gt;bold&lt;/b&gt;");
		});

		it("renders raw {{{ expr }}}", () => {
			const result = render("<p>{{{ html }}}</p>", { html: "<b>bold</b>" });
			expect(result).toContain("<b>bold</b>");
		});

		it("handles unclosed {{ gracefully as text", () => {
			const result = render("<p>{{ unclosed</p>");
			expect(result).toContain("{{ unclosed");
		});
	});

	describe("@if / @elseif / @else", () => {
		it("renders @if true branch", () => {
			const result = render("@if(show)\n  <p>yes</p>\n@end", { show: true });
			expect(result).toContain("<p>yes</p>");
		});

		it("skips @if false branch", () => {
			const result = render("@if(show)\n  <p>yes</p>\n@end", { show: false });
			expect(result).not.toContain("<p>yes</p>");
		});

		it("renders @else branch when condition is false", () => {
			const result = render("@if(show)\n  <p>yes</p>\n@else\n  <p>no</p>\n@end", { show: false });
			expect(result).toContain("<p>no</p>");
			expect(result).not.toContain("<p>yes</p>");
		});

		it("renders @elseif branch", () => {
			const result = render(
				"@if(a)\n  <p>a</p>\n@elseif(b)\n  <p>b</p>\n@else\n  <p>c</p>\n@end",
				{ a: false, b: true },
			);
			expect(result).toContain("<p>b</p>");
			expect(result).not.toContain("<p>a</p>");
			expect(result).not.toContain("<p>c</p>");
		});
	});

	describe("@each", () => {
		it("iterates over array", () => {
			const result = render(
				"@each(item of items)\n  <p>{{ item }}</p>\n@end",
				{ items: ["a", "b", "c"] },
			);
			expect(result).toContain("<p>a</p>");
			expect(result).toContain("<p>b</p>");
			expect(result).toContain("<p>c</p>");
		});

		it("provides $index variable", () => {
			const result = render(
				"@each(item of items)\n  <p>{{ $index }}: {{ item }}</p>\n@end",
				{ items: ["x", "y"] },
			);
			expect(result).toContain("0: x");
			expect(result).toContain("1: y");
		});
	});

	describe("@include", () => {
		it("calls include handler with path", () => {
			const result = render("@include(components/nav)", {}, {
				include: (includePath) => `<nav>${includePath}</nav>`,
			});
			expect(result).toContain("<nav>components/nav</nav>");
		});

		it("calls include handler with props", () => {
			let receivedData: Record<string, unknown> = {};
			render('@include(components/badge, { text: "New" })', {}, {
				include: (_path, data) => {
					receivedData = data;
					return "";
				},
			});
			expect(receivedData).toHaveProperty("text", "New");
		});
	});

	describe("@component with children", () => {
		it("calls component handler with children function", () => {
			const result = render(
				"@component(components/card)\n  <p>inner</p>\n@end",
				{},
				{
					component: (_path, _data, _ctx, childrenFn) => {
						return `<div>${childrenFn()}</div>`;
					},
				},
			);
			expect(result).toContain("<div>");
			expect(result).toContain("<p>inner</p>");
		});
	});

	describe("@children", () => {
		it("renders children content", () => {
			const result = render("<div>@children</div>", { $children: "<span>child</span>" });
			expect(result).toContain("<span>child</span>");
		});

		it("renders empty when no children", () => {
			const result = render("<div>@children</div>");
			expect(result).toContain("<div>");
			expect(result).not.toContain("undefined");
		});
	});

	describe("@provide", () => {
		it("sets context value", () => {
			const result = render(
				'@provide(theme, "dark")\n<p>{{ $context.theme }}</p>',
			);
			expect(result).toContain("dark");
		});
	});

	describe("@head", () => {
		it("calls head handler", () => {
			let headContent = "";
			render(
				"@head\n  <meta name=\"test\">\n@end\n<p>body</p>",
				{},
				{
					head: (fn) => {
						headContent = fn();
					},
				},
			);
			expect(headContent).toContain('<meta name="test">');
		});
	});

	describe("inline JS", () => {
		it("executes single-line <% ... %>", () => {
			const result = render('<% const x = 42 %>\n<p>{{ x }}</p>');
			expect(result).toContain("42");
		});

		it("executes multi-line <% ... %> block", () => {
			const result = render("<%\n  const a = 1;\n  const b = 2;\n  const sum = a + b;\n%>\n<p>{{ sum }}</p>");
			expect(result).toContain("3");
		});
	});

	describe("inline directives", () => {
		it("renders inline @include inside HTML", () => {
			const result = render("<td>@include(x)</td>", {}, {
				include: () => "included",
			});
			expect(result).toContain("<td>included</td>");
		});

		it("renders inline @children inside HTML", () => {
			const result = render("<div>@children</div>", { $children: "child" });
			expect(result).toContain("<div>child</div>");
		});

		it("renders mixed inline {{ expr }}: @include(x)", () => {
			const result = render("{{ label }}: @include(x)", { label: "nav" }, {
				include: () => "included",
			});
			expect(result).toContain("nav: included");
		});
	});

	describe("word boundary", () => {
		it("treats user@children.com as text", () => {
			const result = render("<p>user@children.com</p>");
			expect(result).toContain("user@children.com");
		});

		it("treats @childrenFoo as text", () => {
			const result = render("<p>@childrenFoo</p>");
			expect(result).toContain("@childrenFoo");
		});
	});

	describe("error cases", () => {
		it("throws on @elseif without @if", () => {
			expect(() => compile("@elseif(true)", "test.tml")).toThrow(TmlCompileError);
			expect(() => compile("@elseif(true)", "test.tml")).toThrow("@elseif without matching @if");
		});

		it("throws on @else without @if", () => {
			expect(() => compile("@else", "test.tml")).toThrow(TmlCompileError);
			expect(() => compile("@else", "test.tml")).toThrow("@else without matching @if");
		});

		it("throws on orphan @end", () => {
			expect(() => compile("@end", "test.tml")).toThrow(TmlCompileError);
			expect(() => compile("@end", "test.tml")).toThrow("Unexpected @end");
		});

		it("throws on unclosed block", () => {
			expect(() => compile("@if(true)\n  <p>test</p>", "test.tml")).toThrow(TmlCompileError);
			expect(() => compile("@if(true)\n  <p>test</p>", "test.tml")).toThrow("Unclosed @if block");
		});

		it("throws on unclosed <% block", () => {
			expect(() => compile("<%\n  const x = 1;", "test.tml")).toThrow(TmlCompileError);
			expect(() => compile("<%\n  const x = 1;", "test.tml")).toThrow("Unclosed <% block");
		});
	});
});
