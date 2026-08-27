import type ts from 'typescript';

/**
 * Options for loading a jsdoc-lint config file.
 */
export interface LoadConfigOptions {
  /**
   * Working directory used to resolve config lookup.
   */
  cwd?: string;

  /**
   * Optional explicit config file path.
   */
  configPath?: string;
}

/**
 * Loaded config payload together with its resolved location.
 */
export interface LoadedConfig {
  /**
   * Parsed config object.
   */
  config: Record<string, unknown>;

  /**
   * Resolved config file path when one was found.
   */
  configPath: string | null;

  /**
   * Directory that owns the active config file.
   */
  configRoot: string;
}

/**
 * Raw option input accepted by the checker before config defaults are applied.
 */
export interface NormalizeOptionsInput {
  /**
   * Working directory used to resolve CLI targets.
   */
  cwd?: string;

  /**
   * Workspace root used for reporting and root resolution.
   */
  workspaceRoot?: string;

  /**
   * Parsed config values.
   */
  config?: Record<string, unknown>;

  /**
   * Root directories to scan for packages.
   */
  roots?: string[];

  /**
   * CLI target paths to scope scanning.
   */
  targets?: string[];

  /**
   * Additional excluded path fragments.
   */
  excludePaths?: string[];

  /**
   * Additional excluded filename patterns.
   */
  excludeFiles?: string[];

  /**
   * File extensions to include in the scan.
   */
  includeExtensions?: string[];

  /**
   * Whether direct Drizzle table members require JSDoc.
   */
  requireDrizzleJsDoc?: boolean;

  /**
   * Whether direct Zod object members require JSDoc.
   */
  requireZodJsDoc?: boolean;
}

/**
 * Fully-resolved checker options used during scanning.
 */
export interface NormalizedOptions {
  /**
   * Root directory used for relative paths and configured roots.
   */
  workspaceRoot: string;

  /**
   * Top-level roots scanned for packages.
   */
  roots: string[];

  /**
   * Absolute path filters passed on the command line.
   */
  targetFilters: string[];

  /**
   * Allowed source file extensions.
   */
  includeExtensions: Set<string>;

  /**
   * Normalized excluded path fragments.
   */
  excludePaths: string[];

  /**
   * Compiled filename exclusion patterns.
   */
  excludeFilePatterns: RegExp[];

  /**
   * Whether direct Drizzle table members require JSDoc. Defaults to false.
   */
  requireDrizzleJsDoc?: boolean;

  /**
   * Whether direct Zod object members require JSDoc. Defaults to false.
   */
  requireZodJsDoc?: boolean;
}

/**
 * A single missing or invalid JSDoc diagnostic entry reported by the checker.
 */
export interface FailureEntry {
  /**
   * Package name that owns the missing-doc declaration.
   */
  packageName: string;

  /**
   * Workspace-relative package root.
   */
  packageRelativeRoot: string;

  /**
   * Workspace-relative file path.
   */
  relativeFilePath: string;

  /**
   * 1-based line number of the declaration.
   */
  line: number;

  /**
   * Syntax kind label for the declaration.
   */
  kind: string;

  /**
   * Display name for the declaration.
   */
  name: string;
}

/**
 * Result shape returned by a jsdoc-lint run.
 */
export interface CheckResult {
  /**
   * Missing-doc diagnostics produced by the scan.
   */
  failures: FailureEntry[];
}

/**
 * Internal metadata for a discovered workspace package.
 */
export interface PackageInfo {
  /**
   * Absolute package root path.
   */
  root: string;

  /**
   * Workspace-relative package root path.
   */
  relativeRoot: string;

  /**
   * Package display name.
   */
  name: string;
}

/**
 * Internal description of a declaration that should carry JSDoc.
 */
export interface DocumentableDeclaration {
  /**
   * Syntax kind label used in reporting.
   */
  kind: string;

  /**
   * Display name for the declaration.
   */
  name: string;

  /**
   * AST node that should own the JSDoc block.
   */
  jsDocTarget: ts.Node;

  /**
   * AST node used for source position reporting.
   */
  reportTarget: ts.Node;
}
