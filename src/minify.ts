export const wrapInIIFE = (jsCode: string): string => {
	if (!jsCode.trim()) {
		return "";
	}
	return `(function(){${jsCode}})();`;
};

export const minifyCSS = (css: string): string => {
	let result = css;

	// Remove /* ... */ comments
	result = result.replace(/\/\*[\s\S]*?\*\//g, "");

	// Collapse all whitespace to single space
	result = result.replace(/\s+/g, " ");

	// Remove spaces around { } : ; ,
	result = result.replace(/\s*([{}:;,])\s*/g, "$1");

	// Remove trailing semicolons before }
	result = result.replace(/;}/g, "}");

	return result.trim();
};

export const minifyJS = (js: string): string => {
	let result = js;

	// Trim trailing whitespace on each line
	result = result.replace(/[ \t]+$/gm, "");

	// Collapse consecutive blank lines into one
	result = result.replace(/\n{3,}/g, "\n\n");

	return result.trim();
};
