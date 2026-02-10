import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeHtml, extractRenderData, safePath } from "../src/helpers.ts";

describe("escapeHtml", () => {
	it("escapes & < > \" '", () => {
		expect(escapeHtml('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&#39;");
	});

	it("returns empty string for null", () => {
		expect(escapeHtml(null)).toBe("");
	});

	it("returns empty string for undefined", () => {
		expect(escapeHtml(undefined)).toBe("");
	});

	it("coerces numbers to string", () => {
		expect(escapeHtml(42)).toBe("42");
	});

	it("returns string as-is when no special chars", () => {
		expect(escapeHtml("hello world")).toBe("hello world");
	});
});

describe("safePath", () => {
	const baseDir = "/tmp/views";

	it("resolves valid paths correctly", () => {
		const result = safePath(baseDir, "pages/home");
		expect(result).toBe(path.resolve(baseDir, "pages/home.tml"));
	});

	it("appends .tml extension", () => {
		const result = safePath(baseDir, "components/card");
		expect(result.endsWith(".tml")).toBe(true);
	});

	it("throws on path traversal with ../", () => {
		expect(() => safePath(baseDir, "../etc/passwd")).toThrow(
			"Path traversal detected",
		);
	});

	it("throws on path traversal that escapes base dir", () => {
		expect(() => safePath(baseDir, "../../secret")).toThrow(
			"Path traversal detected",
		);
	});
});

describe("extractRenderData", () => {
	const viewsDir = "/tmp/views";

	it("extracts relative path without .tml", () => {
		const result = extractRenderData(viewsDir, "/tmp/views/pages/home.tml", {});
		expect(result.relativePath).toBe("pages/home");
	});

	it("strips Express internals from data", () => {
		const options = {
			settings: { views: "/tmp/views" },
			_locals: {},
			cache: true,
			title: "Hello",
		};
		const result = extractRenderData(viewsDir, "/tmp/views/test.tml", options);
		expect(result.data).toEqual({ title: "Hello" });
		expect(result.data).not.toHaveProperty("settings");
		expect(result.data).not.toHaveProperty("_locals");
		expect(result.data).not.toHaveProperty("cache");
	});

	it("extracts $context from data", () => {
		const options = { $context: { theme: "dark" }, title: "Test" };
		const result = extractRenderData(viewsDir, "/tmp/views/test.tml", options);
		expect(result.context).toEqual({ theme: "dark" });
		expect(result.data).not.toHaveProperty("$context");
	});

	it("returns empty context when $context not provided", () => {
		const result = extractRenderData(viewsDir, "/tmp/views/test.tml", { title: "Test" });
		expect(result.context).toEqual({});
	});
});
