import path from "node:path";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_MAP[char] as string);
}

export function safePath(baseDir: string, name: string): string {
  const resolved = path.resolve(baseDir, `${name}.tml`);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(`${normalizedBase}${path.sep}`) && resolved !== normalizedBase) {
    throw new Error(`Path traversal detected: "${name}" resolves outside of views directory`);
  }

  return resolved;
}
