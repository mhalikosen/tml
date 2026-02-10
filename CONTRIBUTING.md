# Contributing to TML Engine

## Prerequisites

- Node.js >= 18
- npm

## Setup

```bash
git clone https://github.com/mhalikosen/tml.git
cd tml
npm install
```

## Development Workflow

### Build

```bash
npm run build        # Compile TypeScript to dist/
```

### Run Example

```bash
npm run example      # Run example script (prints HTML to stdout)
npm run dev          # Run example with --watch (auto-reload on changes)
```

The example script demonstrates the programmatic API by rendering a page and printing the final HTML to stdout.

### Test

```bash
npm test             # Run all tests once
npm run test:watch   # Run tests in watch mode
```

### Lint & Format

```bash
npm run check        # Run Biome lint + format (auto-fix)
```

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
example/
  app.ts            # Programmatic demo script
  views/            # Example .tml templates
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - new feature
- `fix:` - bug fix
- `refactor:` - code change that neither fixes a bug nor adds a feature
- `chore:` - tooling, config, dependencies
- `docs:` - documentation only
- `test:` - adding or updating tests
- `perf:` - performance improvement

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Ensure `npm run build`, `npm test`, and `npm run check` pass
5. Commit with conventional commit messages
6. Push and open a pull request against `main`
