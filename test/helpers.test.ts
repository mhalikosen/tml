import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeHtml, safePath } from "../src/helpers.ts";

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
