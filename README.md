# TML Engine

[![npm version](https://img.shields.io/npm/v/tml-engine.svg)](https://www.npmjs.com/package/tml-engine)
[![license](https://img.shields.io/npm/l/tml-engine.svg)](https://github.com/mhalikosen/tml/blob/main/LICENSE)

**Template Markup Language** - a Vue SFC-inspired, server-side template engine with a full component system for Node.js.

TML lets you write each component as a single `.tml` file containing `<template>`, `<style>`, and `<script>` blocks - just like Vue Single File Components, but rendered entirely on the server. CSS and JS are collected only from the components that actually render on a given page, then minified and injected automatically.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [The `.tml` File Format](#the-tml-file-format)
- [Template Syntax](#template-syntax)
  - [Interpolation](#interpolation)
  - [Directives](#directives)
  - [Inline JavaScript](#inline-javascript)
- [Component System](#component-system)
  - [Include](#include)
  - [Component (with children)](#component-with-children)
  - [Layouts](#layouts)
  - [Nested Components](#nested-components)
- [Context API](#context-api)
- [Head Injection](#head-injection)
- [Asset Pipeline](#asset-pipeline)
- [XSS Protection](#xss-protection)
- [Express Integration](#express-integration)
- [Programmatic API](#programmatic-api)
  - [TmlEngine](#tmlengine)
  - [Standalone Functions](#standalone-functions)
- [TypeScript Types](#typescript-types)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [License](#license)

---

## Features

- **Vue SFC-like syntax** - `<template>`, `<style>`, `<script>` blocks in a single `.tml` file
- **Component system** - nested components with children (slots), includes, and layouts
- **Context API** - `@provide` for passing data down the component tree without prop drilling
- **Directives** - `@if` / `@elseif` / `@else`, `@each`, `@include`, `@component`, `@head`, `@children`, `@provide`
- **Interpolation** - `{{ escaped }}` and `{{{ raw }}}` expressions with full JavaScript support
- **Inline JavaScript** - `<% ... %>` blocks for complex logic within templates
- **Automatic asset collection** - CSS and JS from only the rendered components are collected and injected
- **Asset build caching** - `buildInlineAssets()` caches results by collector fingerprint, avoiding redundant esbuild calls
- **Head tag deduplication** - identical `@head` content from different components is deduplicated
- **Injection point warnings** - `console.warn` when `</head>` or `</body>` tags are missing but assets need injection
- **esbuild-powered** - CSS minification and JS bundling/IIFE-wrapping via esbuild
- **Express integration** - works as an Express view engine via `createViewEngine` from `tml-engine/express`
- **Framework-agnostic core** - `TmlEngine` class can be used without Express
- **XSS protection** - all `{{ }}` output is HTML-escaped by default
- **Path traversal protection** - template paths are validated against the views directory
- **Circular reference detection** - render depth limit prevents infinite component recursion
- **Views directory validation** - `configure()` throws a descriptive error if the directory does not exist
- **Symlink loop protection** - directory scanning detects and skips symlink cycles
- **TypeScript** - fully typed with exported type definitions

---

## Installation

```bash
npm install tml-engine
```

**Requirements**: Node.js >= 18

Express is an optional peer dependency - TML works without it if you use the programmatic API.

---

## Quick Start

### Programmatic API

```typescript
import path from "node:path";
import { TmlEngine, buildInlineAssets, injectAssets } from "tml-engine";

const engine = new TmlEngine({
  viewsDir: path.resolve("views"),
});

const { html, collector } = engine.renderPage("pages/home", {
  title: "Hello",
  items: ["a", "b", "c"],
});

const assets = await buildInlineAssets(collector);
const finalHtml = injectAssets(html, assets);
```

### Express Integration

```typescript
import path from "node:path";
import express from "express";
import { createViewEngine } from "tml-engine/express";

const app = express();
const viewsDir = path.resolve(import.meta.dirname, "views");

app.engine("tml", createViewEngine({ viewsDir, cache: false }));
app.set("view engine", "tml");
app.set("views", viewsDir);

app.get("/", (_req, res) => {
  res.render("pages/home", {
    title: "My App",
    items: [
      { name: "Alpha", active: true },
      { name: "Beta", active: false },
    ],
  });
});

app.listen(3000);
```

### Create a layout (`views/layouts/main.tml`)

```html
<template>
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>{{ title }}</title>
  </head>
  <body>
    @children
  </body>
  </html>
</template>
```

### Create a page (`views/pages/home.tml`)

```html
<template>
  @head
    <meta name="description" content="My app homepage">
  @end
  @component(layouts/main)
    <main>
      <h1>{{ title }}</h1>
      <ul>
        @each(item of items)
          @if(item.active)
            <li class="active">{{ item.name }} (#{{ $index }})</li>
          @else
            <li class="inactive">{{ item.name }}</li>
          @end
        @end
      </ul>
    </main>
  @end
</template>

<style>
  main { max-width: 800px; margin: 0 auto; padding: 2rem; }
  .active { color: green; }
  .inactive { color: gray; text-decoration: line-through; }
</style>
```

When rendered, TML will:
1. Compile and render the page template with the provided data
2. Collect CSS from all rendered components (layout, page)
3. Minify the CSS via esbuild and inject it as an inline `<style>` tag before `</head>`
4. Bundle/minify any `<script>` blocks and inject them before `</body>`

---

## The `.tml` File Format

Every `.tml` file is a single-file component with up to three blocks:

```html
<template>
  <!-- Required: the HTML template with directives and interpolation -->
</template>

<style>
  /* Optional: CSS scoped to this component (collected at render time) */
</style>

<script>
  // Optional: client-side JS (bundled as IIFE, collected at render time)
</script>
```

**Rules:**
- The `<template>` block is required - its contents are compiled into a render function
- `<style>` and `<script>` blocks are optional
- Blocks can appear in any order
- Only one of each block type is supported per file
- Content outside of these blocks is ignored

---

## Template Syntax

### Interpolation

TML supports two forms of interpolation inside `<template>`:

#### Escaped output (safe)

```html
{{ expression }}
```

The expression is evaluated as JavaScript, converted to a string, and **HTML-escaped**. This is the default and recommended form for user-facing data.

```html
<p>Hello, {{ user.name }}</p>
<p>Total: {{ items.length * 2 }}</p>
<p>Status: {{ isActive ? "Active" : "Inactive" }}</p>
```

Characters `& < > " '` are escaped to their HTML entity equivalents.

#### Raw output (unescaped)

```html
{{{ expression }}}
```

The expression is output **without escaping**. Use this only when you trust the content (e.g. pre-sanitized HTML from a CMS).

```html
{{{ article.htmlContent }}}
{{{ '<em>Trusted HTML</em>' }}}
```

#### Expressions

Both `{{ }}` and `{{{ }}}` support any JavaScript expression. All template data variables are available directly:

```html
{{ firstName + " " + lastName }}
{{ items.filter(i => i.active).length }}
{{ new Date().getFullYear() }}
{{ $context.theme?.primary || "#000" }}
```

---

### Directives

Directives are special lines that start with `@`. They control rendering logic.

#### `@if` / `@elseif` / `@else` / `@end`

Conditional rendering. The expression is evaluated as JavaScript:

```html
@if(user && user.isAdmin)
  <div class="admin-panel">
    <h2>Admin Panel</h2>
  </div>
@elseif(user)
  <p>Welcome, {{ user.name }}</p>
@else
  <p>Please log in</p>
@end
```

- `@if(expr)` - starts a conditional block
- `@elseif(expr)` - optional, can chain multiple
- `@else` - optional, the fallback branch
- `@end` - required, closes the block

#### `@each` / `@end`

Iterates over an array or any iterable. A `$index` variable (0-based) is automatically available:

```html
@each(item of items)
  <div class="item">
    <span class="index">#{{ $index + 1 }}</span>
    <span>{{ item.name }}</span>
  </div>
@end
```

The iteration variable name is yours to choose:

```html
@each(user of team)
  <p>{{ user.name }} - {{ user.role }}</p>
@end

@each(tag of post.tags)
  <span class="tag">{{ tag }}</span>
@end
```

You can iterate over any expression that returns an iterable:

```html
@each(item of items.filter(i => i.visible))
  <p>{{ item.name }}</p>
@end
```

#### `@include`

Renders another template inline. The included template receives the current template's data, optionally merged with additional props:

```html
<!-- Include with parent data -->
@include(components/header)

<!-- Include with extra props (merged into parent data) -->
@include(components/hero, { heading: title, subtitle: "Welcome" })
```

Paths are relative to the views directory, without the `.tml` extension. An include does **not** support children - use `@component` for that.

#### `@component` / `@end`

Renders a component and passes the content between `@component` and `@end` as children. The component uses `@children` to render the passed content:

```html
@component(components/card, { title: "My Card" })
  <p>This paragraph becomes the children content.</p>
  <p>You can put any HTML and directives here.</p>
@end
```

The component file (`components/card.tml`):

```html
<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <div class="card-body">
      @children
    </div>
  </div>
</template>

<style>
  .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5rem; }
</style>
```

#### `@children`

Outputs the children content passed by a parent `@component`. If no children were passed, outputs nothing:

```html
<template>
  <div class="wrapper">
    @children
  </div>
</template>
```

#### `@provide`

Injects a value into the context, accessible by all descendant components via `$context`:

```html
@provide(theme, { primary: "#3040d0", dark: "#1a1a2e" })
@provide(locale, "en")
```

Any nested component (at any depth) can read the value:

```html
<p style="color: {{ $context.theme.primary }}">Themed text</p>
<p>Locale: {{ $context.locale }}</p>
```

Context values are immutable per render scope - a child `@provide` creates a new context for its descendants without affecting siblings.

#### `@head` / `@end`

Injects content into the document's `<head>` tag. Useful for per-page meta tags, titles, or link elements:

```html
@head
  <title>{{ title }} | My App</title>
  <meta name="description" content="{{ description }}">
  <link rel="canonical" href="{{ canonicalUrl }}">
@end
```

The content is collected during render and inserted before `</head>` in the final HTML. Multiple `@head` blocks from different components are concatenated. Identical `@head` content from different components is deduplicated by content.

---

### Inline JavaScript

For logic that doesn't fit in a single expression, use inline JS blocks.

#### Single-line

```html
<% const fullName = user.firstName + " " + user.lastName %>
<p>{{ fullName }}</p>
```

#### Multi-line

```html
<%
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const tax = total * 0.18;
  const grandTotal = total + tax;
%>
<p>Subtotal: ${{ total.toFixed(2) }}</p>
<p>Tax: ${{ tax.toFixed(2) }}</p>
<p>Total: ${{ grandTotal.toFixed(2) }}</p>
```

#### Inline `for` loops

You can use JavaScript control flow directly:

```html
<% for (const [index, member] of team.entries()) { %>
  <tr>
    <td>{{ index + 1 }}</td>
    <td>{{ member.name }}</td>
  </tr>
<% } %>
```

**Note:** Inline JS runs in the same scope as the compiled template. All template data variables are available. Variables declared in inline JS blocks are accessible by subsequent template content.

---

## Component System

### Include

`@include` renders a component inline, passing data through:

```
views/
  components/
    badge.tml
  pages/
    home.tml
```

```html
<!-- pages/home.tml -->
@include(components/badge, { text: "New" })
```

```html
<!-- components/badge.tml -->
<template>
  <span class="badge">{{ text }}</span>
</template>

<style>
  .badge { padding: 0.2rem 0.6rem; background: #3040d0; color: #fff; border-radius: 12px; }
</style>
```

The included component receives the parent's data merged with any additional props. Additional props override parent data when keys conflict.

### Component (with children)

`@component` wraps content and passes it as children:

```html
<!-- pages/home.tml -->
@component(components/card, { title: "Features" })
  <ul>
    <li>Fast rendering</li>
    <li>Component system</li>
  </ul>
@end
```

Inside the component, `@children` outputs the wrapped content.

### Layouts

Layouts are just components. A layout defines the HTML skeleton and uses `@children` to place page content:

```html
<!-- layouts/main.tml -->
<template>
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>{{ title }}</title>
  </head>
  <body>
    @children
  </body>
  </html>
</template>
```

Pages wrap their content with the layout:

```html
<!-- pages/home.tml -->
<template>
  @component(layouts/main)
    <main>
      <h1>{{ title }}</h1>
      <p>Page content here</p>
    </main>
  @end
</template>
```

### Nested Components

Components can be nested to any depth. Each component's CSS and JS are collected independently:

```html
@component(components/card, { title: "Outer Card" })
  @component(components/card, { title: "Inner Card" })
    <p>Deeply nested content</p>
    @include(components/badge, { text: "Nested" })
  @end
@end
```

TML includes a render depth limit (100 levels) to detect accidental circular references. If component A includes component B which includes component A, TML will throw a `TmlRenderError` instead of recursing infinitely.

---

## Context API

The context API lets you pass data down the component tree without threading it through every intermediate component's props.

### Setting context

```html
@provide(theme, { primary: "#3040d0", secondary: "#f0f0f0" })
@provide(currentUser, user)
```

### Reading context

Any component at any depth can access context values through the `$context` object:

```html
<div style="background: {{ $context.theme.secondary }}">
  <p style="color: {{ $context.theme.primary }}">
    Hello, {{ $context.currentUser.name }}
  </p>
</div>
```

### Context scoping

Context flows downward. A `@provide` in a page is visible to all components rendered within that page. A `@provide` inside a component is only visible to that component's descendants.

```html
@provide(level, "page")      <!-- visible everywhere below -->
@component(layouts/main)
  @provide(level, "layout")  <!-- overrides for layout's descendants only -->
  <p>{{ $context.level }}</p> <!-- "layout" -->
@end
```

---

## Head Injection

The `@head` directive lets any component contribute to the document's `<head>`:

```html
<!-- pages/blog-post.tml -->
<template>
  @head
    <title>{{ post.title }} | Blog</title>
    <meta property="og:title" content="{{ post.title }}">
    <meta property="og:description" content="{{ post.excerpt }}">
  @end
  @component(layouts/main)
    <article>{{ post.content }}</article>
  @end
</template>
```

Head tags from all rendered components are collected and injected before the `</head>` closing tag. Identical `@head` content from different components is automatically deduplicated.

If the HTML does not contain a `</head>` tag, a `console.warn` is emitted to help with debugging.

---

## Asset Pipeline

TML automatically handles CSS and JS assets:

1. **Collection** - When a component is rendered, its `<style>` and `<script>` blocks are collected into a `RenderCollector`
2. **Deduplication** - Each component's assets are stored by component path, so a component rendered multiple times (e.g. in a loop) only contributes its assets once
3. **CSS Minification** - All collected CSS is concatenated and minified using esbuild's CSS transform
4. **JS Bundling** - Each component's JS is bundled independently as an IIFE using esbuild, then concatenated
5. **Injection** - The minified CSS is injected as `<style>` before `</head>`, the bundled JS as `<script>` before `</body>`
6. **Caching** - `buildInlineAssets()` caches results by collector fingerprint (up to 100 entries, FIFO eviction). Identical collector contents return cached results without calling esbuild again. Call `clearAssetCache()` to invalidate.

### Custom asset handling

With `createViewEngine`, you can intercept the asset pipeline:

```typescript
app.engine(
  "tml",
  createViewEngine({
    viewsDir,
    onAssets: (collector) => {
      // collector.styles - Map<componentPath, cssString>
      // collector.scripts - Map<componentPath, jsString>
      // collector.headTags - Map<componentPath, headHtml>

      // Return your own asset tags
      return {
        headTag: "",   // injected before </head>
        cssTag: "",    // injected before </head> (after headTag)
        jsTag: "",     // injected before </body>
      };
    },
  }),
);
```

With the programmatic API, you have full control:

```typescript
const { html, collector } = engine.renderPage("pages/home", data);

// Access raw assets
for (const [componentPath, css] of collector.styles) {
  console.log(`CSS from ${componentPath}:`, css);
}

// Or use the built-in builder
const assets = await buildInlineAssets(collector);
const finalHtml = injectAssets(html, assets);
```

---

## XSS Protection

All `{{ expression }}` output is HTML-escaped by default. The following characters are escaped:

| Character | Escaped to |
|-----------|------------|
| `&`       | `&amp;`    |
| `<`       | `&lt;`     |
| `>`       | `&gt;`     |
| `"`       | `&quot;`   |
| `'`       | `&#39;`    |

```html
<!-- If user.name is '<script>alert("xss")</script>' -->
<p>{{ user.name }}</p>
<!-- Output: <p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p> -->
```

Use `{{{ }}}` (triple braces) only for trusted, pre-sanitized HTML content:

```html
{{{ trustedHtmlFromCMS }}}
```

---

## Express Integration

### `createViewEngine`

Import `createViewEngine` from the `/express` subpath:

```typescript
import { createViewEngine } from "tml-engine/express";

app.engine(
  "tml",
  createViewEngine({
    viewsDir: path.resolve("views"),
    cache: process.env.NODE_ENV === "production",
    onAssets: (collector) => {
      // Custom asset processing
      return { headTag: "", cssTag: "", jsTag: "" };
    },
  }),
);
```

This creates a dedicated `TmlEngine` instance.

#### `TmlExpressOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `viewsDir` | `string` | - | **Required.** Absolute path to the views directory |
| `cache` | `boolean` | `true` in production | Cache compiled templates |
| `onAssets` | `(collector: RenderCollector) => AssetTags` | - | Custom asset processing. When not provided, assets are built and injected inline automatically |

---

## Programmatic API

### `TmlEngine`

Use `TmlEngine` directly for framework-agnostic rendering:

```typescript
import { TmlEngine, buildInlineAssets, injectAssets } from "tml-engine";

const engine = new TmlEngine({
  viewsDir: path.resolve("views"),
  cache: true,
});

// Render a page
const { html, collector } = engine.renderPage("pages/home", {
  title: "Hello",
  items: ["a", "b", "c"],
});

// Build and inject CSS/JS assets
const assets = await buildInlineAssets(collector);
const finalHtml = injectAssets(html, assets);
```

#### Constructor

```typescript
new TmlEngine(config?: TmlEngineConfig)
```

If a config is provided, `configure()` is called immediately, scanning the views directory.

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(config: TmlEngineConfig)` | `void` | Set views directory and cache option. Clears all caches and scans the views directory |
| `renderPage(path, data?, context?)` | `RenderResult` | Render a page template. Returns `{ html, collector }` |
| `renderFile(filePath, options, callback)` | `Promise<void>` | Express-compatible render method. Builds and injects assets automatically |
| `renderComponent(path, data, context, collector, children?)` | `string` | Render a single component. Low-level - prefer `renderPage` |
| `clearCache()` | `void` | Clear compiled template, parsed component, and asset build caches |
| `getCSS(componentPath)` | `string \| undefined` | Get the raw CSS for a specific component |
| `getJS(componentPath)` | `string \| undefined` | Get the raw JS for a specific component |
| `getAllCSS()` | `Map<string, string>` | Get all registered CSS (component path -> CSS string) |
| `getAllJS()` | `Map<string, string>` | Get all registered JS (component path -> JS string) |

### Standalone Functions

#### `buildInlineAssets(collector: RenderCollector): Promise<AssetTags>`

Takes a render collector and produces minified/bundled asset tags:
- Concatenates and minifies all CSS via esbuild
- Bundles each component's JS as an IIFE via esbuild
- Joins and deduplicates head tags
- Results are cached by collector fingerprint - identical collectors return cached results

#### `injectAssets(html: string, assets: AssetTags): string`

Injects asset tags into the HTML string:
- `assets.headTag` and `assets.cssTag` are injected before `</head>`
- `assets.jsTag` is injected before `</body>`
- Emits `console.warn` if injection points are missing but assets exist

#### `clearAssetCache(): void`

Clears the module-level asset build cache. Also called by `TmlEngine.clearCache()`.

---

## TypeScript Types

All types are exported from the main entry point:

```typescript
import type {
  AssetTags,
  CompiledTemplate,
  ExpressViewEngine,
  ParsedComponent,
  RenderCollector,
  RenderResult,
  TemplateCache,
  TmlEngineConfig,
} from "tml-engine";
```

### `TmlEngineConfig`

```typescript
interface TmlEngineConfig {
  viewsDir: string;   // Absolute path to views directory
  cache?: boolean;     // Cache compiled templates (default: false)
}
```

### `RenderResult`

```typescript
interface RenderResult {
  html: string;                // The rendered HTML string
  collector: RenderCollector;  // Collected assets from rendered components
}
```

### `RenderCollector`

```typescript
interface RenderCollector {
  styles: Map<string, string>;    // Component path -> CSS
  scripts: Map<string, string>;   // Component path -> JS
  headTags: Map<string, string>;  // Component path -> head HTML
}
```

### `AssetTags`

```typescript
interface AssetTags {
  headTag: string;  // Collected @head content
  cssTag: string;   // <style> tag with minified CSS
  jsTag: string;    // <script> tag with bundled JS
}
```

### `ParsedComponent`

```typescript
interface ParsedComponent {
  template: string;  // Content of <template> block
  style: string;     // Content of <style> block
  script: string;    // Content of <script> block
}
```

### `ExpressViewEngine`

```typescript
type ExpressViewEngine = (
  filePath: string,
  options: Record<string, unknown>,
  callback: (err: Error | null, rendered?: string) => void,
) => void;
```

---

## Error Handling

TML provides two error classes for template issues:

### `TmlCompileError`

Thrown during template compilation (syntax errors in directives):

```typescript
import { TmlCompileError } from "tml-engine";

try {
  engine.renderPage("pages/broken", data);
} catch (error) {
  if (error instanceof TmlCompileError) {
    console.error(error.message);   // "Unclosed @if block - missing @end at pages/broken:15"
    console.error(error.filePath);  // "pages/broken"
    console.error(error.line);      // 15
  }
}
```

Common compile errors:
- `Unclosed @if block - missing @end`
- `@else without matching @if`
- `@elseif without matching @if`
- `Unexpected @end without matching block`
- `Unclosed <% block - missing %>`
- `Compilation failed: ...`

### `TmlRenderError`

Thrown during template rendering (runtime errors in expressions):

```typescript
import { TmlRenderError } from "tml-engine";

try {
  engine.renderPage("pages/home", data);
} catch (error) {
  if (error instanceof TmlRenderError) {
    console.error(error.message);   // "Cannot read properties of undefined at pages/home:0"
    console.error(error.filePath);  // "pages/home"
    console.error(error.line);      // 0
  }
}
```

Common render errors:
- Undefined variable access in expressions
- `Maximum render depth (100) exceeded - possible circular component reference`
- `Template not found: ...`
- `Path traversal detected: ...`

---

## Configuration

### Caching

When `cache: true`, compiled template functions are stored in memory. The views directory is scanned once at startup. This is recommended for production.

When `cache: false` (default), templates are re-read and re-compiled on every render. This gives instant feedback during development.

```typescript
const engine = new TmlEngine({
  viewsDir: path.resolve("views"),
  cache: process.env.NODE_ENV === "production",
});
```

### Views Directory

The views directory is scanned recursively on `configure()`. If the directory does not exist, a descriptive error is thrown. Symlink loops within the directory are detected and skipped. All `.tml` files are parsed and their CSS/JS are registered. Template paths in directives are relative to the views directory:

```
views/
  layouts/main.tml      -> path: "layouts/main"
  components/card.tml   -> path: "components/card"
  pages/home.tml        -> path: "pages/home"
```

---

## Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Run tests in watch mode
```

Tests use [vitest](https://vitest.dev/) and cover helpers, parser, compiler, engine integration, and the Express adapter.

---

## Project Structure

```
src/
  index.ts          # Public API exports
  engine.ts         # TmlEngine class, asset building/caching, asset injection
  express.ts        # Express view engine adapter (createViewEngine)
  compiler.ts       # Template-to-function compiler (directives, interpolation)
  parser.ts         # SFC parser (extracts <template>, <style>, <script>)
  helpers.ts        # HTML escaping, path safety, render data extraction
  types.ts          # Shared TypeScript types and interfaces
test/
  fixtures/         # Minimal .tml files for integration tests
  helpers.test.ts   # escapeHtml, safePath, extractRenderData tests
  parser.test.ts    # SFC parser tests
  compiler.test.ts  # Compiler directive and interpolation tests
  engine.test.ts    # TmlEngine integration tests
  express.test.ts   # Express adapter (createViewEngine) tests
example/
  app.ts            # Programmatic demo script (prints HTML to stdout)
  views/            # Example .tml templates
```

---

## License

[MIT](LICENSE)
