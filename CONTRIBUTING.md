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

### Run Example App

```bash
npm run dev          # Start example app with --watch (auto-reload on changes)
npm run example      # Start example app (no watch)
```

The example app runs at `http://localhost:3456` and demonstrates components, layouts, directives, and asset collection.

### Lint & Format

```bash
npm run check        # Run Biome lint + format (auto-fix)
```

## Project Structure

```
src/
  index.ts          # Public API exports and default engine singleton
  engine.ts         # TmlEngine class, asset building, asset injection
  express.ts        # Express view engine adapter (createViewEngine)
  compiler.ts       # Template-to-function compiler (directives, interpolation)
  parser.ts         # SFC parser (extracts <template>, <style>, <script>)
  helpers.ts        # HTML escaping, path safety, render data extraction
  types.ts          # Shared TypeScript types and interfaces
example/
  app.ts            # Express demo app
  views/            # Example .tml templates
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `chore:` — tooling, config, dependencies
- `docs:` — documentation only

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Ensure `npm run build` and `npm run check` pass
5. Commit with conventional commit messages
6. Push and open a pull request against `main`
