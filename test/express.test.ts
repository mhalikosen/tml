import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createViewEngine } from "../src/express.ts";
import { clearAssetCache } from "../src/index.ts";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("createViewEngine", () => {
	beforeEach(() => {
		clearAssetCache();
	});

	it("returns a callable function", () => {
		const viewEngine = createViewEngine({ viewsDir: fixturesDir });
		expect(typeof viewEngine).toBe("function");
	});

	it("renders template and passes HTML to callback", async () => {
		const viewEngine = createViewEngine({ viewsDir: fixturesDir });
		const filePath = path.join(fixturesDir, "simple.tml");

		const html = await new Promise<string>((resolve, reject) => {
			viewEngine(filePath, { settings: { views: fixturesDir } , title: "Hello" }, (err, rendered) => {
				if (err) return reject(err);
				resolve(rendered!);
			});
		});

		expect(html).toContain("<h1>Hello</h1>");
	});

	it("calls custom onAssets callback", async () => {
		let onAssetsCalled = false;
		const viewEngine = createViewEngine({
			viewsDir: fixturesDir,
			onAssets: (collector) => {
				onAssetsCalled = true;
				expect(collector).toHaveProperty("styles");
				expect(collector).toHaveProperty("scripts");
				return { headTag: "", cssTag: "", jsTag: "" };
			},
		});
		const filePath = path.join(fixturesDir, "with-style.tml");

		await new Promise<string>((resolve, reject) => {
			viewEngine(filePath, { settings: { views: fixturesDir }, message: "Hi" }, (err, rendered) => {
				if (err) return reject(err);
				resolve(rendered!);
			});
		});

		expect(onAssetsCalled).toBe(true);
	});

	it("passes error to callback on failure", async () => {
		const viewEngine = createViewEngine({ viewsDir: fixturesDir });
		const filePath = path.join(fixturesDir, "nonexistent.tml");

		const error = await new Promise<Error>((resolve) => {
			viewEngine(filePath, { settings: { views: fixturesDir } }, (err) => {
				resolve(err!);
			});
		});

		expect(error).toBeInstanceOf(Error);
	});

	it("works with cache enabled", async () => {
		const viewEngine = createViewEngine({
			viewsDir: fixturesDir,
			cache: true,
		});
		const filePath = path.join(fixturesDir, "simple.tml");

		const html1 = await new Promise<string>((resolve, reject) => {
			viewEngine(filePath, { settings: { views: fixturesDir, "view cache": true }, title: "First" }, (err, rendered) => {
				if (err) return reject(err);
				resolve(rendered!);
			});
		});

		const html2 = await new Promise<string>((resolve, reject) => {
			viewEngine(filePath, { settings: { views: fixturesDir, "view cache": true }, title: "Second" }, (err, rendered) => {
				if (err) return reject(err);
				resolve(rendered!);
			});
		});

		expect(html1).toContain("First");
		expect(html2).toContain("Second");
	});
});
