import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "../src/index.ts";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("render", () => {
	describe("basic rendering", () => {
		it("renders a simple template", () => {
			const result = render(fixturesDir, "simple", { title: "Hello" });
			expect(result.html).toContain("<h1>Hello</h1>");
			expect(result.css).toBe("");
			expect(result.js).toBe("");
		});

		it("renders a template with style", () => {
			const result = render(fixturesDir, "with-style", {
				message: "Hi",
			});
			expect(result.html).toContain("Hi");
			expect(result.css).not.toBe("");
			expect(result.css).toContain("color");
		});

		it("renders a template with script", () => {
			const result = render(fixturesDir, "with-script", {
				label: "Click",
			});
			expect(result.html).toContain("Click");
			expect(result.css).not.toBe("");
			expect(result.js).not.toBe("");
		});
	});

	describe("@include", () => {
		it("renders nested template via @include", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-include-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					'<template>\n  @include(partial, { label: "Menu" })\n</template>',
				);
				fs.writeFileSync(
					path.join(tmpDir, "partial.tml"),
					"<template>\n  <nav>{{ label }}</nav>\n</template>",
				);
				const result = render(tmpDir, "page", {});
				expect(result.html).toContain("<nav>Menu</nav>");
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe("@component with @children", () => {
		it("renders component with children", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-component-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					'<template>\n  @component(card, { title: "Test Card" })\n    <p>Card content</p>\n  @end\n</template>',
				);
				fs.writeFileSync(
					path.join(tmpDir, "card.tml"),
					'<template>\n  <div class="card">\n    <h3>{{ title }}</h3>\n    @children\n  </div>\n</template>\n\n<style>\n  .card { border: 1px solid #ccc; }\n</style>',
				);
				const result = render(tmpDir, "page", {});
				expect(result.html).toContain("Test Card");
				expect(result.html).toContain("Card content");
				expect(result.css).not.toBe("");
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe("render depth guard", () => {
		it("throws on circular component reference", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-depth-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "a.tml"),
					"<template>\n  @include(b)\n</template>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "b.tml"),
					"<template>\n  @include(a)\n</template>",
				);
				expect(() => render(tmpDir, "a", {})).toThrow(
					"Maximum render depth",
				);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe("CSS/JS collection and minification", () => {
		it("collects and minifies CSS from multiple components", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-assets-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					"<template>\n  @include(comp-a)\n  @include(comp-b)\n</template>\n\n<style>\n  .page { margin: 0; }\n</style>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "comp-a.tml"),
					"<template>\n  <div>A</div>\n</template>\n\n<style>\n  .a { color: red; }\n</style>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "comp-b.tml"),
					"<template>\n  <div>B</div>\n</template>\n\n<style>\n  .b { color: blue; }\n</style>",
				);
				const result = render(tmpDir, "page", {});
				expect(result.css).toContain(".page");
				expect(result.css).toContain(".a");
				expect(result.css).toContain(".b");
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("deduplicates CSS from same component rendered multiple times", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-dedup-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					"<template>\n  @include(badge, { text: \"A\" })\n  @include(badge, { text: \"B\" })\n</template>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "badge.tml"),
					'<template>\n  <span>{{ text }}</span>\n</template>\n\n<style>\n  .badge { padding: 4px; }\n</style>',
				);
				const result = render(tmpDir, "page", {});
				const badgeCount = (result.css.match(/\.badge/g) || []).length;
				expect(badgeCount).toBe(1);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("bundles JS as IIFE", () => {
			const result = render(fixturesDir, "with-script", {
				label: "Btn",
			});
			expect(result.js).not.toBe("");
		});
	});

	describe("@head injection", () => {
		it("injects head tags before </head>", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-head-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "layout.tml"),
					"<template>\n  <html>\n  <head><title>Test</title></head>\n  <body>@children</body>\n  </html>\n</template>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					'<template>\n  @head\n    <meta name="description" content="test">\n  @end\n  @component(layout)\n    <p>Content</p>\n  @end\n</template>',
				);
				const result = render(tmpDir, "page", {});
				expect(result.html).toContain(
					'<meta name="description" content="test">',
				);
				expect(result.html).toContain("</head>");
				const headCloseIndex = result.html.indexOf("</head>");
				const metaIndex = result.html.indexOf(
					'<meta name="description"',
				);
				expect(metaIndex).toBeLessThan(headCloseIndex);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("deduplicates identical head tags from different components", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-head-dedup-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "layout.tml"),
					"<template>\n  <html>\n  <head><title>Test</title></head>\n  <body>@children</body>\n  </html>\n</template>",
				);
				fs.writeFileSync(
					path.join(tmpDir, "comp-a.tml"),
					'<template>\n  @head\n    <meta name="viewport" content="width=device-width">\n  @end\n  <div>A</div>\n</template>',
				);
				fs.writeFileSync(
					path.join(tmpDir, "comp-b.tml"),
					'<template>\n  @head\n    <meta name="viewport" content="width=device-width">\n  @end\n  <div>B</div>\n</template>',
				);
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					"<template>\n  @component(layout)\n    @include(comp-a)\n    @include(comp-b)\n  @end\n</template>",
				);
				const result = render(tmpDir, "page", {});
				const viewportCount = (
					result.html.match(/viewport/g) || []
				).length;
				expect(viewportCount).toBe(1);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("throws when @head is used but </head> is missing", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-head-err-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					'<template>\n  @head\n    <meta name="test">\n  @end\n  <div>No head tag</div>\n</template>',
				);
				expect(() => render(tmpDir, "page", {})).toThrow(
					"@head directive requires a </head> tag in the document",
				);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe("error handling", () => {
		it("throws when views directory does not exist", () => {
			expect(() => render("/nonexistent/path", "page", {})).toThrow(
				"Views directory does not exist",
			);
		});

		it("throws when template is not found", () => {
			expect(() =>
				render(fixturesDir, "nonexistent", {}),
			).toThrow("Template not found");
		});

		it("throws on path traversal", () => {
			expect(() =>
				render(fixturesDir, "../../etc/passwd", {}),
			).toThrow("Path traversal detected");
		});

		it("handles malformed CSS gracefully via esbuild", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-bad-css-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					"<template>\n  <div>test</div>\n</template>\n\n<style>\n  body { color: \n</style>",
				);
				const result = render(tmpDir, "page", {});
				expect(result.css).toBeDefined();
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("throws on invalid JS", () => {
			const tmpDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "tml-bad-js-"),
			);
			try {
				fs.writeFileSync(
					path.join(tmpDir, "page.tml"),
					"<template>\n  <div>test</div>\n</template>\n\n<script>\n  function {{{{ invalid\n</script>",
				);
				expect(() => render(tmpDir, "page", {})).toThrow();
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});
});
