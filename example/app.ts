import path from "node:path";
import { render } from "../src/index.ts";

const viewsDir = path.resolve(import.meta.dirname, "views");

const { html, css, js } = render(viewsDir, "pages/home", {
	title: "TML Engine",
	user: { name: "Ali", role: "admin" },
	features: [
		{ name: "Component System", description: "Everything is a component. Even layouts.", isNew: false },
		{ name: "Children", description: "React-like children for nested components.", isNew: true },
		{ name: "Context API", description: "Share data without prop drilling via @provide.", isNew: true },
		{ name: "Asset Pipeline", description: "Only used components' assets are collected.", isNew: false },
	],
	xssTest: '<script>alert("XSS")</script>',
	safeHtml: "<em>This is trusted HTML</em>",
});

console.log("=== HTML ===");
console.log(html);
console.log("\n=== CSS ===");
console.log(css);
if (js) {
	console.log("\n=== JS ===");
	console.log(js);
}
