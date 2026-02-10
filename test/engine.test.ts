import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compile } from "../src/compiler.ts";
import { buildInlineAssets, clearAssetCache, injectAssets, TmlEngine } from "../src/index.ts";
import { escapeHtml } from "../src/helpers.ts";
import type { RenderCollector } from "../src/types.ts";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("TmlEngine", () => {
	let engine: TmlEngine;

	beforeEach(() => {
		clearAssetCache();
		engine = new TmlEngine({ viewsDir: fixturesDir });
	});

	describe("constructor and configure", () => {
		it("creates engine with config", () => {
			expect(engine).toBeInstanceOf(TmlEngine);
		});

		it("creates engine without config and configures later", () => {
			const lazyEngine = new TmlEngine();
			lazyEngine.configure({ viewsDir: fixturesDir });
			const { html } = lazyEngine.renderPage("simple", { title: "Test" });
			expect(html).toContain("Test");
		});

		it("throws when viewsDir does not exist", () => {
			expect(() => new TmlEngine({ viewsDir: "/nonexistent" })).toThrow(
				"Views directory does not exist",
			);
		});
	});

	describe("symlink loop protection", () => {
		it("handles symlink loop without crashing", () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tml-symlink-"));
			try {
				fs.writeFileSync(
					path.join(tmpDir, "index.tml"),
					"<template>\n  <p>{{ title }}</p>\n</template>",
				);
				fs.symlinkSync(tmpDir, path.join(tmpDir, "loop"));

				const loopEngine = new TmlEngine({ viewsDir: tmpDir });
				const { html } = loopEngine.renderPage("index", { title: "works" });
				expect(html).toContain("works");
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	});

	describe("renderPage", () => {
		it("returns html and collector", () => {
			const result = engine.renderPage("simple", { title: "Hello" });
			expect(result).toHaveProperty("html");
			expect(result).toHaveProperty("collector");
			expect(result.html).toContain("<h1>Hello</h1>");
		});

		it("collects styles into collector", () => {
			const { collector } = engine.renderPage("with-style", { message: "Hi" });
			expect(collector.styles.size).toBeGreaterThan(0);
			expect(collector.styles.has("with-style")).toBe(true);
		});

		it("collects scripts into collector", () => {
			const { collector } = engine.renderPage("with-script", { label: "Click" });
			expect(collector.scripts.size).toBeGreaterThan(0);
			expect(collector.scripts.has("with-script")).toBe(true);
		});
	});

	describe("@include", () => {
		it("renders nested template via @include", () => {
			const template = '@include(partial, { label: "Menu" })';
			const fn = compile(template, "test-page");
			const collector: RenderCollector = { styles: new Map(), scripts: new Map(), headTags: new Map() };

			const includeHandler = (includePath: string, data: Record<string, unknown>, context: Record<string, unknown>) =>
				engine.renderComponent(includePath, data, context, collector);
			const componentHandler = () => "";
			const headHandler = () => {};

			const html = fn({}, escapeHtml, includeHandler, componentHandler, {}, headHandler);
			expect(html).toContain("<nav>Menu</nav>");
		});
	});

	describe("@component with children", () => {
		it("renders component with children", () => {
			const template = '@component(card, { title: "Test Card" })\n  <p>Card content</p>\n@end';
			const fn = compile(template, "test-page");
			const collector: RenderCollector = { styles: new Map(), scripts: new Map(), headTags: new Map() };

			const includeHandler = (includePath: string, data: Record<string, unknown>, context: Record<string, unknown>) =>
				engine.renderComponent(includePath, data, context, collector);
			const componentHandler = (compPath: string, compData: Record<string, unknown>, compContext: Record<string, unknown>, childrenFn: () => string) =>
				engine.renderComponent(compPath, compData, compContext, collector, childrenFn());
			const headHandler = (fnArg: () => string) => {
				const result = fnArg();
				if (result) collector.headTags.set("test-page", result);
			};

			const html = fn({}, escapeHtml, includeHandler, componentHandler, {}, headHandler);
			expect(html).toContain("Test Card");
			expect(html).toContain("Card content");
			expect(collector.styles.has("card")).toBe(true);
		});
	});

	describe("render depth guard", () => {
		it("renders within depth limit", () => {
			const collector: RenderCollector = { styles: new Map(), scripts: new Map(), headTags: new Map() };
			const result = engine.renderComponent("simple", { title: "test" }, {}, collector);
			expect(result).toContain("test");
		});
	});

	describe("clearCache", () => {
		it("forces re-compilation", () => {
			const { html: html1 } = engine.renderPage("simple", { title: "First" });
			expect(html1).toContain("First");

			engine.clearCache();

			const { html: html2 } = engine.renderPage("simple", { title: "Second" });
			expect(html2).toContain("Second");
		});
	});

	describe("buildInlineAssets", () => {
		it("produces <style> and <script> tags", async () => {
			const { collector } = engine.renderPage("with-script", { label: "Btn" });
			const assets = await buildInlineAssets(collector);
			expect(assets.cssTag).toContain("<style>");
			expect(assets.jsTag).toContain("<script>");
		});

		it("returns cached result on second call", async () => {
			const { collector } = engine.renderPage("with-style", { message: "Hi" });
			const assets1 = await buildInlineAssets(collector);
			const assets2 = await buildInlineAssets(collector);
			expect(assets1).toBe(assets2);
		});
	});

	describe("clearAssetCache", () => {
		it("invalidates cached assets", async () => {
			const { collector } = engine.renderPage("with-style", { message: "Hi" });
			const assets1 = await buildInlineAssets(collector);
			clearAssetCache();
			const assets2 = await buildInlineAssets(collector);
			expect(assets1).not.toBe(assets2);
			expect(assets1.cssTag).toBe(assets2.cssTag);
		});
	});

	describe("injectAssets", () => {
		it("injects before </head> and </body>", () => {
			const html = "<html><head></head><body></body></html>";
			const result = injectAssets(html, {
				headTag: "<meta name='test'>",
				cssTag: "<style>body{}</style>",
				jsTag: "<script>alert(1)</script>",
			});
			expect(result).toContain("<meta name='test'>\n<style>body{}</style>\n</head>");
			expect(result).toContain("<script>alert(1)</script>\n</body>");
		});

		it("warns on missing </head> when assets exist", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			injectAssets("<html><body></body></html>", {
				headTag: "<meta>",
				cssTag: "<style></style>",
				jsTag: "",
			});
			expect(warnSpy).toHaveBeenCalledWith(
				"[tml] Could not inject head/CSS assets: </head> tag not found",
			);
			warnSpy.mockRestore();
		});

		it("warns on missing </body> when JS assets exist", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			injectAssets("<html><head></head></html>", {
				headTag: "",
				cssTag: "",
				jsTag: "<script>x</script>",
			});
			expect(warnSpy).toHaveBeenCalledWith(
				"[tml] Could not inject JS assets: </body> tag not found",
			);
			warnSpy.mockRestore();
		});
	});

	describe("head tag deduplication", () => {
		it("deduplicates identical head tags from different components", async () => {
			const collector: RenderCollector = {
				styles: new Map(),
				scripts: new Map(),
				headTags: new Map([
					["component-a", '<meta name="viewport" content="width=device-width">'],
					["component-b", '<meta name="viewport" content="width=device-width">'],
					["component-c", '<meta name="description" content="test">'],
				]),
			};
			const assets = await buildInlineAssets(collector);
			const viewportCount = (assets.headTag.match(/viewport/g) || []).length;
			expect(viewportCount).toBe(1);
			expect(assets.headTag).toContain("description");
		});
	});

	describe("error handling", () => {
		it("throws on template not found", () => {
			const collector: RenderCollector = { styles: new Map(), scripts: new Map(), headTags: new Map() };
			expect(() => engine.renderComponent("nonexistent", {}, {}, collector)).toThrow(
				"Template not found",
			);
		});

		it("throws on path traversal", () => {
			const collector: RenderCollector = { styles: new Map(), scripts: new Map(), headTags: new Map() };
			expect(() => engine.renderComponent("../../etc/passwd", {}, {}, collector)).toThrow(
				"Path traversal detected",
			);
		});
	});
});
