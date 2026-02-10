import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.ts";

describe("parse", () => {
	it("parses full SFC with all 3 blocks", () => {
		const source = `
<template>
  <div>Hello</div>
</template>

<style>
  div { color: red; }
</style>

<script>
  console.log("hi");
</script>`;

		const result = parse(source);
		expect(result.template).toBe("<div>Hello</div>");
		expect(result.style).toBe("div { color: red; }");
		expect(result.script).toBe('console.log("hi");');
	});

	it("returns empty strings for template-only file", () => {
		const source = `<template><p>Text</p></template>`;
		const result = parse(source);
		expect(result.template).toBe("<p>Text</p>");
		expect(result.style).toBe("");
		expect(result.script).toBe("");
	});

	it("handles blocks in any order", () => {
		const source = `
<script>
  alert(1);
</script>

<style>
  body { margin: 0; }
</style>

<template>
  <div>content</div>
</template>`;

		const result = parse(source);
		expect(result.template).toBe("<div>content</div>");
		expect(result.style).toBe("body { margin: 0; }");
		expect(result.script).toBe("alert(1);");
	});

	it("ignores content outside blocks", () => {
		const source = `
This is ignored
<template>
  <p>inside</p>
</template>
This is also ignored`;

		const result = parse(source);
		expect(result.template).toBe("<p>inside</p>");
		expect(result.style).toBe("");
		expect(result.script).toBe("");
	});

	it("returns all empty strings for empty input", () => {
		const result = parse("");
		expect(result.template).toBe("");
		expect(result.style).toBe("");
		expect(result.script).toBe("");
	});
});
