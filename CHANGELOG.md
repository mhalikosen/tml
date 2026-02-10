# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-02-10

### Added

- vitest test suite with comprehensive coverage for helpers, parser, compiler, and engine
- Asset build caching in `buildInlineAssets()` keyed by collector fingerprint
- `clearAssetCache()` export to invalidate asset build cache
- Head tag content deduplication in `buildInlineAssets()`
- `console.warn` when `</head>` or `</body>` injection points are missing

### Changed

- Example app is now a programmatic Node.js script (no Express dependency, prints HTML to stdout and exits)
- `TmlEngine.clearCache()` now also clears the asset build cache

### Removed

- Default singleton exports (`configure`, `renderPage`, `renderFile`, `renderComponent`, `clearCache`, `getCSS`, `getJS`, `getAllCSS`, `getAllJS`) - use `TmlEngine` class directly
- `__express` export - use `createViewEngine` from `tml-engine/express` instead
- Unused `EXPR_RAW` and `EXPR_ESCAPED` regex constants from compiler

## [0.2.0] - 2025-06-15

### Added

- Multi-line inline JS block support (`<% ... %>`)
- esbuild-based CSS minification and JS bundling
- TypeScript build pipeline for npm publishing
- Express view engine adapter (`createViewEngine`)
- `@head` directive for dynamic head tag injection
- CSS/JS minification and JS scope isolation
- `prepare` script for git-based installs
- Circular component reference detection (render depth guard)
- `ExpressViewEngine` type export for consumer use

### Changed

- Replaced regex CSS minification with esbuild transform
- Replaced manual IIFE wrapping with esbuild script bundling
- Extracted `TmlEngine` class for framework-agnostic architecture

### Fixed

- Error message duplication in compile/render errors
- `@provide` context propagation to child components

### Removed

- Dead `minify.ts` module (superseded by esbuild)
- Deprecated `TmlEngineOptions` and `initRegistry` aliases

## [0.1.0] - 2025-05-01

### Added

- Initial TML engine implementation
- Vue SFC-inspired `.tml` file format (`<template>`, `<style>`, `<script>`)
- Component system with `@include` and `@component` directives
- Children (slot) support via `@children`
- Context API with `@provide` and `$context`
- Conditional rendering (`@if`, `@elseif`, `@else`)
- Loop rendering (`@each`)
- HTML-escaped (`{{ }}`) and raw (`{{{ }}}`) interpolation
- Express view engine integration (`__express`)
- Path traversal protection
