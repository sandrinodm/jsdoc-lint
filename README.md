# jsdoc-lint

Context is king. JSDoc lets teams colocate durable, human-readable context directly with the code agents need to inspect and modify. `jsdoc-lint` helps validate that your codebase has the necessary JSDoc comments in place, so important intent, constraints, and usage notes stay close to the code, giving your agents the necessary context co-located with your code.

`jsdoc-lint` is authored in TypeScript, publishes built JavaScript and declarations, and targets Node.js 24. The checker covers:

- functions and function-like declarations
- classes, interfaces, and type aliases
- documented fields on classes, interfaces, and named object type aliases
- direct members of inline type arguments in class `extends` clauses
- top-level `const` declarations
- direct properties inside top-level object-literal constants
- optionally, direct Drizzle table and Zod object-schema members

JSDoc blocks must be multiline. Single-line blocks like `/** Description. */` are reported the same way as missing JSDoc.

## Install

```sh
pnpm add -D jsdoc-lint
```

## CLI

From a workspace root:

```sh
pnpm exec jsdoc-lint
```

Check specific package roots or file paths:

```sh
pnpm exec jsdoc-lint packages/ui
pnpm exec jsdoc-lint packages/ui/src/index.ts
```

Emit JSON instead of the default human-readable report:

```sh
pnpm exec jsdoc-lint --json
```

Show help:

```sh
pnpm exec jsdoc-lint --help
```

The CLI exits with:

- `0` when no diagnostics are found
- `1` when lint diagnostics are found
- `2` for usage or runtime errors

## Options

- `--config <path>`: load config from a specific JSON file
- `--root <path>`: add a root to scan when no positional targets are provided
- `--exclude-path <path>`: exclude a path segment or relative path prefix
- `--exclude-file <regex>`: exclude filenames or relative paths matching a regex
- `--include-ext <ext>`: restrict scanned file extensions
- `--require-drizzle-jsdoc`: require JSDoc on direct Drizzle table members
- `--require-zod-jsdoc`: require JSDoc on direct Zod object members
- `--json`: emit machine-readable JSON
- `-h`, `--help`: show usage

## Config

By default the checker walks upward from the current directory and loads the nearest `jsdoc.json`.

Supported config keys:

- `roots: string[]`
- `excludePaths: string[]`
- `excludeFiles: string[]`
- `includeExtensions: string[]`
- `requireDrizzleJsDoc: boolean` (default: `false`)
- `requireZodJsDoc: boolean` (default: `false`)

Example:

```json
{
  "roots": ["apps", "packages"],
  "excludePaths": ["node_modules", "dist", ".next", "packages/ui/src/generated"],
  "excludeFiles": ["\\.d\\.[cm]?ts$", "\\.test\\.[^.]+$", "\\.spec\\.[^.]+$"],
  "includeExtensions": [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"],
  "requireDrizzleJsDoc": true,
  "requireZodJsDoc": true
}
```

Path and extension CLI flags override their config values for the current run. Schema JSDoc flags enable their
corresponding checks for the current run.

### Drizzle and Zod schema members

The schema-member checks are disabled by default. Drizzle detection follows imports from `drizzle-orm` package paths and
checks the direct properties in the columns object passed to imported table functions such as `pgTable`, `mysqlTable`,
and `sqliteTable`.

Zod detection follows default, namespace, and named imports from `zod` package paths. It checks direct properties passed
to `object`, `strictObject`, and `looseObject`, including members of nested object schemas.

Schema properties use the same multiline JSDoc and member-spacing requirements as other documented members.

## Library

```ts
import {
  formatReport,
  loadConfig,
  normalizeOptions,
  runCheck
} from "jsdoc-lint";

const { config, configRoot } = loadConfig({ cwd: process.cwd() });
const options = normalizeOptions({
  cwd: process.cwd(),
  workspaceRoot: configRoot,
  config
});

const result = runCheck(options);
console.log(formatReport(result));
```

## Development

```sh
pnpm install
pnpm test
pnpm run test:coverage
pnpm run typecheck
pnpm run build
pnpm run test:package
```
