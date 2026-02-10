# TML

[![npm version](https://img.shields.io/npm/v/tml.svg)](https://www.npmjs.com/package/tml)
[![license](https://img.shields.io/npm/l/tml.svg)](https://github.com/mhalikosen/tml/blob/main/LICENSE)

**Template Markup Language** - a Vue SFC-inspired, server-side template engine with a full component system for Node.js.

TML lets you write each component as a single `.tml` file containing `<template>`, `<style>`, and `<script>` blocks - just like Vue Single File Components, but rendered entirely on the server. CSS and JS are collected only from the components that actually render on a given page, then minified and returned as separate strings.

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
- [API](#api)
- [TypeScript Types](#typescript-types)
- [Error Handling](#error-handling)
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
- **Automatic asset collection** - CSS and JS from only the rendered components are collected and returned
- **Head tag deduplication** - identical `@head` content from different components is deduplicated
- **esbuild-powered** - CSS minification and JS bundling/IIFE-wrapping via esbuild (sync)
- **Single function API** - one `render()` call returns `{ html, css, js }`
- **Framework-agnostic** - use with any HTTP framework (Express, Fastify, Hono, etc.)
- **XSS protection** - all `{{ }}` output is HTML-escaped by default
- **Path traversal protection** - template paths are validated against the views directory
- **Circular reference detection** - render depth limit prevents infinite component recursion
- **TypeScript** - fully typed with exported type definitions

---

## Installation

```bash
npm install tml
```

**Requirements**: Node.js >= 18

---

## Quick Start

```typescript
import { render } from "tml";

const { html, css, js } = render("./views", "pages/home", {
  title: "Hello",
  items: ["a", "b", "c"],
});

// html → rendered HTML string (@head content injected before </head>)
// css  → minified CSS string (collected from all rendered components, deduplicated)
// js   → bundled+minified JS string (IIFE, collected from all rendered components)
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
2. Inject `@head` content before `</head>` in the HTML
3. Collect CSS from all rendered components, minify via esbuild, and return as `css`
4. Bundle/minify any `<script>` blocks as IIFE and return as `js`

### Using with Express

```typescript
import express from "express";
import { render } from "tml";

const app = express();

app.get("/", (req, res) => {
  const { html, css, js } = render("./views", "pages/home", {
    title: "My App",
  });

  // Inject CSS/JS however you prefer:
  const finalHtml = html
    .replace("</head>", `<style>${css}</style></head>`)
    .replace("</body>", `<script>${js}</script></body>`);

  res.send(finalHtml);
});

app.listen(3000);
```

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

You can iterate over any expression that returns an iterable:

```html
@each(item of items.filter(i => i.visible))
  <p>{{ item.name }}</p>
@end
```

#### `@include`

Renders another template inline:

```html
@include(components/header)
@include(components/hero, { heading: title, subtitle: "Welcome" })
```

Paths are relative to the views directory, without the `.tml` extension.

#### `@component` / `@end`

Renders a component and passes the content between `@component` and `@end` as children:

```html
@component(components/card, { title: "My Card" })
  <p>This paragraph becomes the children content.</p>
@end
```

#### `@children`

Outputs the children content passed by a parent `@component`:

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
```

Any nested component can read the value:

```html
<p style="color: {{ $context.theme.primary }}">Themed text</p>
```

#### `@head` / `@end`

Injects content into the document's `<head>` tag:

```html
@head
  <title>{{ title }} | My App</title>
  <meta name="description" content="{{ description }}">
@end
```

The content is collected during render and inserted before `</head>` in the final HTML. If `@head` is used but the HTML does not contain a `</head>` tag, an error is thrown.

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

---

## Component System

### Include

`@include` renders a component inline, passing data through:

```html
@include(components/badge, { text: "New" })
```

The included component receives the parent's data merged with any additional props.

### Component (with children)

`@component` wraps content and passes it as children:

```html
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

TML includes a render depth limit (100 levels) to detect accidental circular references.

---

## Context API

The context API lets you pass data down the component tree without threading it through every intermediate component's props.

### Setting context

```html
@provide(theme, { primary: "#3040d0", secondary: "#f0f0f0" })
@provide(currentUser, user)
```

### Reading context

```html
<div style="background: {{ $context.theme.secondary }}">
  <p style="color: {{ $context.theme.primary }}">
    Hello, {{ $context.currentUser.name }}
  </p>
</div>
```

### Context scoping

Context flows downward. A `@provide` in a page is visible to all components rendered within that page. A `@provide` inside a component is only visible to that component's descendants.

---

## Head Injection

The `@head` directive lets any component contribute to the document's `<head>`:

```html
<template>
  @head
    <title>{{ post.title }} | Blog</title>
    <meta property="og:title" content="{{ post.title }}">
  @end
  @component(layouts/main)
    <article>{{ post.content }}</article>
  @end
</template>
```

Head tags from all rendered components are collected and injected before the `</head>` closing tag. Identical `@head` content from different components is automatically deduplicated.

**Important:** If `@head` is used but the rendered HTML does not contain a `</head>` tag, a `TmlRenderError` is thrown. This prevents silent failures in partial renders.

---

## Asset Pipeline

TML automatically handles CSS and JS assets:

1. **Collection** - When a component is rendered, its `<style>` and `<script>` blocks are collected
2. **Deduplication** - Each component's assets are stored by component path, so a component rendered multiple times only contributes its assets once
3. **CSS Minification** - All collected CSS is concatenated and minified using esbuild's `transformSync`
4. **JS Bundling** - Each component's JS is bundled independently as an IIFE using esbuild's `buildSync`, then concatenated
5. **Returned separately** - CSS and JS are returned as separate strings in the `RenderResult`, giving you full control over how to deliver them

```typescript
const { html, css, js } = render("./views", "pages/home", data);

// Inline injection
const finalHtml = html
  .replace("</head>", `<style>${css}</style></head>`)
  .replace("</body>", `<script>${js}</script></body>`);

// Or serve as separate files, use a CDN, etc.
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

Use `{{{ }}}` (triple braces) only for trusted, pre-sanitized HTML content.

---

## API

### `render(viewsDir, viewPath, data?)`

The main (and only) function. Renders a `.tml` template and returns HTML, CSS, and JS.

```typescript
import { render } from "tml";

const result = render(viewsDir, viewPath, data);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `viewsDir` | `string` | Path to the views directory |
| `viewPath` | `string` | Template path relative to viewsDir (without `.tml` extension) |
| `data` | `Record<string, unknown>` | Template data (optional, defaults to `{}`) |

**Returns:** `RenderResult`

| Property | Type | Description |
|----------|------|-------------|
| `html` | `string` | Rendered HTML with `@head` content injected before `</head>` |
| `css` | `string` | Minified CSS from all rendered components (empty string if none) |
| `js` | `string` | Bundled+minified JS from all rendered components (empty string if none) |

**Behavior:**
- Synchronous - uses `esbuild.transformSync` and `esbuild.buildSync`
- No caching - templates are read and compiled on every call
- `@head` content is injected before `</head>` in the HTML
- If `@head` is used but `</head>` is not found, throws `TmlRenderError`
- CSS/JS are returned as separate strings, not injected into the HTML
- Component CSS/JS are deduplicated by component path

---

## TypeScript Types

All types are exported from the main entry point:

```typescript
import type { CompiledTemplate, ParsedComponent, RenderResult } from "tml";
```

### `RenderResult`

```typescript
interface RenderResult {
  html: string;  // Rendered HTML string
  css: string;   // Minified CSS from all rendered components
  js: string;    // Bundled+minified JS from all rendered components
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

---

## Error Handling

TML provides two error classes for template issues:

### `TmlCompileError`

Thrown during template compilation (syntax errors in directives):

```typescript
import { TmlCompileError } from "tml";

try {
  render("./views", "pages/broken", data);
} catch (error) {
  if (error instanceof TmlCompileError) {
    console.error(error.message);   // "Unclosed @if block - missing @end at pages/broken:15"
    console.error(error.filePath);  // "pages/broken"
    console.error(error.line);      // 15
  }
}
```

### `TmlRenderError`

Thrown during template rendering (runtime errors in expressions):

```typescript
import { TmlRenderError } from "tml";

try {
  render("./views", "pages/home", data);
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
- `@head directive requires a </head> tag in the document`

---

## Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Run tests in watch mode
```

Tests use [vitest](https://vitest.dev/) and cover helpers, parser, compiler, and engine integration.

---

## Project Structure

```
src/
  index.ts          # Public API exports
  engine.ts         # render() function, head injection, CSS/JS processing
  compiler.ts       # Template-to-function compiler (directives, interpolation)
  parser.ts         # SFC parser (extracts <template>, <style>, <script>)
  helpers.ts        # HTML escaping, path safety
  types.ts          # Shared TypeScript types and interfaces
test/
  fixtures/         # Minimal .tml files for integration tests
  helpers.test.ts   # escapeHtml, safePath tests
  parser.test.ts    # SFC parser tests
  compiler.test.ts  # Compiler directive and interpolation tests
  engine.test.ts    # render() integration tests
example/
  app.ts            # Demo script (prints HTML/CSS/JS to stdout)
  views/            # Example .tml templates
```

---

## License

[MIT](LICENSE)
