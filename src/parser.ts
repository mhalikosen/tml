import type { ParsedComponent } from "./types.ts";

const TEMPLATE_REGEX = /<template>([\s\S]*?)<\/template>/;
const STYLE_REGEX = /<style>([\s\S]*?)<\/style>/;
const SCRIPT_REGEX = /<script>([\s\S]*?)<\/script>/;

export function parse(source: string): ParsedComponent {
  const templateMatch = source.match(TEMPLATE_REGEX);
  const styleMatch = source.match(STYLE_REGEX);
  const scriptMatch = source.match(SCRIPT_REGEX);

  return {
    template: templateMatch ? templateMatch[1].trim() : "",
    style: styleMatch ? styleMatch[1].trim() : "",
    script: scriptMatch ? scriptMatch[1].trim() : "",
  };
}
